-- 0143_deterministic_replacement.sql
-- Cluster lifecycle simplification (Migration B): remove candidate-selection
-- voting and refill continuously until the cluster is back to 8 members.
--
--   1. source_candidates() (live body 0141): any non-empty pool now takes the
--      single-candidate path — candidate_pool is exactly [v_pool[1]] (the
--      longest-waiting eligible candidate; both SELECTs are ORDER BY
--      queue_entries.joined_at), status='inviting', select_candidate_vote_id
--      is cleared, and create_invitation() runs. The 'voting' update, the
--      votes(select_candidate) insert, and the 'Candidates are up for
--      selection' fan-out are deleted. The pool concat is NULL-safe
--      (`coalesce(v_pool,'{}')`), fixing a latent drop where an empty
--      same-key pool discarded top-up candidates. Eligibility SELECTs are
--      byte-for-byte identical to 0141.
--   2. close_expired_votes() (live body 0136): the select_candidate resolution
--      is removed; stray legacy rows are defensively closed as 'superseded'
--      without notification (no new candidate-selection votes can be created,
--      but an un-closeable NULL-outcome row would otherwise violate the
--      vote_result title constraint and abort the whole batch).
--      replace_member + change_name are byte-for-byte identical.
--   3. vote_on() (live body 0138): the select_candidate pool-membership check
--      is deleted; governance yes/no validation, auth guards, and rate limits
--      are preserved.
--   4. leave_cluster() (live body 0132): a departure while a replacement cycle
--      is already in flight no longer supersedes it — the vacancy is covered
--      by the accept-chain recount. Otherwise start_replacement() as before.
--      Cooldown + departure notice preserved.
--   5. accept_invitation() (live body 0142): under the existing advisory lock,
--      refuse with 'cluster_full' when the cluster is already at 8 (defense
--      against legacy orphan invitations/races), and after a successful join
--      recount active members — while still below 8 with no other active
--      round, immediately start the next replacement cycle (sequential chain).
--   6. progress_replacements() (live body 0136): keeps the re-source loop +
--      pool_exhausted sweep and gains a bounded safety-net scan that starts a
--      fresh cycle for active clusters below 8 with no active round and no
--      pending invitation (covers pool_exhausted closures and crash windows).
--   7. One-shot cutover: open select_candidate votes close as 'superseded'
--      (no vote_result fan-out — an internal marker, not a community result);
--      their 'voting' rounds return to selecting_candidates and are re-sourced
--      through the new deterministic path immediately.

create or replace function public.source_candidates(p_round_id uuid, p_system_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round record;
  v_pool uuid[];
  v_extra uuid[];
  v_attempts int;
  v_cluster_key text;
begin
  perform pg_advisory_xact_lock(hashtext('replacement:' || p_round_id));

  select * into v_round from public.replacement_rounds where id = p_round_id;
  if v_round is null then return; end if;
  if v_round.status in ('closed', 'filled') then return; end if;

  v_attempts := v_round.attempts + 1;
  update public.replacement_rounds set attempts = v_attempts, updated_at = now()
  where id = p_round_id;

  select queue_key into v_cluster_key from public.clusters where id = v_round.cluster_id;

  -- 1) best match: same queue_key as the cluster's own formation key
  select array_agg(q.user_id) into v_pool
  from (
    select q.user_id
    from public.queue_entries q
    join public.profiles pr
      on pr.id = q.user_id
     and pr.onboarding_completed_at is not null
    left join public.mode_cooldowns mc
      on mc.user_id = q.user_id
     and mc.mode = v_round.mode
     and mc.available_at > now()
    where q.mode = v_round.mode
      and q.queue_key = v_cluster_key
      and mc.user_id is null
      and not (q.user_id = any(coalesce(v_round.declined_user_ids, '{}')))
      and not exists (
        select 1 from public.cluster_members cm
        join public.clusters c on c.id = cm.cluster_id
        where cm.user_id = q.user_id and cm.left_at is null and c.matching_mode = v_round.mode
      )
    order by q.joined_at
    limit 3
  ) q;

  -- 2) top-up from any queue in the mode
  if coalesce(array_length(v_pool, 1), 0) < 3 then
    select array_agg(u) into v_extra
    from (
      select q.user_id as u
      from public.queue_entries q
      join public.profiles pr
        on pr.id = q.user_id
       and pr.onboarding_completed_at is not null
      left join public.mode_cooldowns mc
        on mc.user_id = q.user_id
       and mc.mode = v_round.mode
       and mc.available_at > now()
      where q.mode = v_round.mode
        and q.queue_key <> v_cluster_key
        and mc.user_id is null
        and not (q.user_id = any(coalesce(v_round.declined_user_ids, '{}')))
        and not (q.user_id = any(coalesce(v_pool, '{}')))
        and not exists (
          select 1 from public.cluster_members cm
          join public.clusters c on c.id = cm.cluster_id
          where cm.user_id = q.user_id and cm.left_at is null and c.matching_mode = v_round.mode
        )
      order by q.joined_at
      limit (3 - coalesce(array_length(v_pool, 1), 0))
    ) t;
    v_pool := coalesce(v_pool, '{}') || coalesce(v_extra, '{}');
  end if;

  -- empty pool: retry later via cron, close after too many attempts
  if coalesce(array_length(v_pool, 1), 0) = 0 then
    if v_attempts >= 5 then
      update public.replacement_rounds
      set status = 'closed', closed_reason = 'pool_exhausted', candidate_pool = '{}', updated_at = now()
      where id = p_round_id;
    else
      update public.replacement_rounds
      set status = 'selecting_candidates', candidate_pool = '{}', updated_at = now()
      where id = p_round_id;
    end if;
    return;
  end if;

  -- Deterministic pick: invite the longest-waiting eligible candidate.
  -- Candidate-selection votes are removed; the pool holds exactly the
  -- selected candidate. Decline/expire re-sources the next eligible one.
  update public.replacement_rounds
  set candidate_pool = array[v_pool[1]], status = 'inviting', invited_user_id = v_pool[1],
      select_candidate_vote_id = null, updated_at = now()
  where id = p_round_id;
  perform public.create_invitation(p_round_id);
  return;
end; $$;

create or replace function public.close_expired_votes() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_vote record;
  v_yes int; v_no int; v_total int; v_active int; v_quorum int; v_mode matching_mode;
  v_result jsonb; v_updated int;
begin
  perform pg_advisory_xact_lock(hashtext('vote-close'));
  perform set_config('statement_timeout', '240s', true);

  for v_vote in
    select * from public.votes
    where status = 'open' and closes_at < now()
    order by closes_at limit 100 for update skip locked
  loop
    select matching_mode into v_mode from public.clusters where id = v_vote.cluster_id;

    select count(*) into v_active
    from public.cluster_members
    where cluster_id = v_vote.cluster_id and left_at is null;

    v_quorum := public.fn_quorum(v_active);

    select count(*) filter (where choice = 'yes'),
           count(*) filter (where choice = 'no'),
           count(*)
      into v_yes, v_no, v_total
    from public.vote_responses where vote_id = v_vote.id;

    v_result := jsonb_build_object(
      'yes', v_yes, 'no', v_no, 'cast', v_total,
      'quorum', v_quorum, 'quorum_met', v_total >= v_quorum
    );

    -- Dead path: candidate-selection votes no longer resolve. Close any stray
    -- legacy row as superseded without fan-out and continue (same semantics
    -- as the one-shot cutover below).
    if v_vote.type = 'select_candidate' then
      update public.votes
      set status = 'closed',
          result = v_result || jsonb_build_object('outcome', 'superseded')
      where id = v_vote.id and status = 'open';
      continue;
    end if;

    if v_vote.type = 'replace_member' then
      if v_total >= v_quorum and v_yes > v_no then
        v_result := v_result || jsonb_build_object('outcome', 'passed');
        update public.cluster_members set left_at = now()
        where cluster_id = v_vote.cluster_id and user_id = v_vote.target_member_id;
        insert into public.mode_cooldowns (user_id, mode, available_at)
        values (v_vote.target_member_id, v_mode, now() + public.fn_cooldown_interval(v_mode))
        on conflict (user_id, mode) do update set available_at = excluded.available_at;
        perform public.start_replacement(v_vote.cluster_id);
      else
        v_result := v_result || jsonb_build_object('outcome', 'failed');
      end if;

    elsif v_vote.type = 'change_name' then
      if v_total >= v_quorum and v_yes > v_no then
        update public.clusters set name = v_vote.name_suggestion, updated_at = now()
        where id = v_vote.cluster_id;
        v_result := v_result || jsonb_build_object('outcome', 'passed', 'name', v_vote.name_suggestion);
      else
        v_result := v_result || jsonb_build_object('outcome', 'failed');
      end if;
    end if;

    update public.votes set status = 'closed', result = v_result
    where id = v_vote.id and status = 'open';
    get diagnostics v_updated = row_count;
    -- Already closed by a concurrent run: skip the fan-out so members are not
    -- notified twice and start_replacement effects are not re-applied.
    if v_updated = 0 then continue; end if;

    insert into public.notifications (user_id, type, cluster_id, title, body)
    select user_id, 'vote_result', v_vote.cluster_id,
           'Vote result: ' || (v_result->>'outcome'), null
    from public.cluster_members
    where cluster_id = v_vote.cluster_id and left_at is null;
  end loop;
end; $$;

create or replace function public.vote_on(p_vote_id uuid, p_choice text) returns void
language plpgsql security definer set search_path = public as $$
declare v_type vote_type;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select v.type into v_type
  from public.votes v
  join public.cluster_members cm on cm.cluster_id = v.cluster_id
  where v.id = p_vote_id and cm.user_id = auth.uid() and cm.left_at is null and v.status = 'open';

  if v_type is null then raise exception 'vote_not_available'; end if;

  if v_type in ('replace_member', 'change_name') then
    if p_choice not in ('yes', 'no') then raise exception 'invalid_choice'; end if;
  else
    raise exception 'invalid_choice';
  end if;

  perform public.check_rate_limit('vote', 10, interval '1 hour');

  insert into public.vote_responses (vote_id, user_id, choice)
  values (p_vote_id, auth.uid(), p_choice)
  on conflict (vote_id, user_id) do update set choice = excluded.choice, created_at = now();
end; $$;

create or replace function public.leave_cluster(p_cluster_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mode matching_mode;
  v_leaver_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if not public.is_active_member(p_cluster_id) then raise exception 'not_a_member'; end if;

  select matching_mode into v_mode from public.clusters where id = p_cluster_id;

  select display_name into v_leaver_name
  from public.profiles where id = auth.uid();

  update public.cluster_members set left_at = now()
  where cluster_id = p_cluster_id and user_id = auth.uid();

  insert into public.mode_cooldowns (user_id, mode, available_at)
  values (auth.uid(), v_mode, now() + public.fn_cooldown_interval(v_mode))
  on conflict (user_id, mode) do update set available_at = excluded.available_at;

  -- Continuous refill: a departure while a replacement cycle is already in
  -- flight does not supersede it (that would orphan the pending invitation).
  -- The extra vacancy is covered by the accept-chain recount in
  -- accept_invitation(). The check-then-start below holds the same advisory
  -- lock accept_invitation() uses, so concurrent departures cannot open two
  -- rounds for one cluster.
  perform pg_advisory_xact_lock(hashtext('replacement:' || p_cluster_id));
  if not exists (
    select 1 from public.replacement_rounds
    where cluster_id = p_cluster_id
      and status in ('selecting_candidates', 'voting', 'inviting')
  ) then
    perform public.start_replacement(p_cluster_id);
  end if;

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select cm.user_id, 'replacement', p_cluster_id,
         coalesce(v_leaver_name, 'A member') || ' left the cluster',
         'A spot just opened - we are finding a new member to fill it.'
  from public.cluster_members cm
  where cm.cluster_id = p_cluster_id and cm.left_at is null;
end; $$;

create or replace function public.accept_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record; v_active int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv.user_id <> auth.uid() then raise exception 'not_yours'; end if;
  if v_inv.status <> 'pending' then raise exception 'already_responded'; end if;

  if exists (
    select 1 from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    where cm.user_id = auth.uid() and cm.left_at is null
      and c.matching_mode = (select matching_mode from public.clusters where id = v_inv.cluster_id)
  ) then raise exception 'already_in_cluster_of_mode'; end if;

  perform pg_advisory_xact_lock(hashtext('replacement:' || v_inv.cluster_id));

  -- Defensive: never grow a cluster past 8 (legacy orphan invitations/races).
  select count(*) into v_active
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null;
  if v_active >= 8 then raise exception 'cluster_full'; end if;

  update public.invitations set status = 'accepted', responded_at = now()
  where id = p_invitation_id;

  insert into public.cluster_members (cluster_id, user_id)
  values (v_inv.cluster_id, v_inv.user_id);

  delete from public.queue_entries where user_id = v_inv.user_id;

  update public.replacement_rounds
  set status = 'filled', invited_user_id = v_inv.user_id, updated_at = now()
  where cluster_id = v_inv.cluster_id and status = 'inviting';

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select user_id, 'replacement', v_inv.cluster_id, 'A new member has joined', null
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null;

  -- Continuous refill: chain the next cycle while still below 8 members.
  -- The just-filled round is terminal, so at most one invitation is ever
  -- pending per cluster (sequential, never parallel).
  select count(*) into v_active
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null;
  if v_active < 8 then
    if not exists (
      select 1 from public.replacement_rounds
      where cluster_id = v_inv.cluster_id
        and status in ('selecting_candidates', 'voting', 'inviting')
    ) then
      perform public.start_replacement(v_inv.cluster_id);
    end if;
  end if;
end; $$;

create or replace function public.progress_replacements() returns void
language plpgsql security definer set search_path = public as $$
declare v_round record; v_system uuid; v_cluster_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('replacement-progress'));
  perform set_config('statement_timeout', '120s', true);

  for v_round in
    select * from public.replacement_rounds
    where status = 'selecting_candidates'
    order by created_at limit 100 for update skip locked
  loop
    select user_id into v_system from public.cluster_members
    where cluster_id = v_round.cluster_id and left_at is null
    order by joined_at limit 1;
    perform public.source_candidates(v_round.id, v_system);
  end loop;

  update public.replacement_rounds
  set status = 'closed', closed_reason = 'pool_exhausted', updated_at = now()
  where status in ('selecting_candidates', 'voting', 'inviting')
    and attempts >= 5
    and created_at < now() - interval '14 days';

  -- Safety net for the continuous-refill invariant: active clusters below 8
  -- members with no active round and no pending invitation get a fresh cycle
  -- (covers pool_exhausted closures and crash windows).
  for v_cluster_id in
    select c.id from public.clusters c
    where c.status = 'active'
      and (select count(*) from public.cluster_members cm
           where cm.cluster_id = c.id and cm.left_at is null) < 8
      and not exists (
        select 1 from public.replacement_rounds r
        where r.cluster_id = c.id
          and r.status in ('selecting_candidates', 'voting', 'inviting')
      )
      and not exists (
        select 1 from public.invitations i
        where i.cluster_id = c.id and i.status = 'pending'
      )
    order by c.created_at limit 100 for update of c skip locked
  loop
    perform public.start_replacement(v_cluster_id);
  end loop;
end; $$;

-- One-shot cutover: close every open candidate-selection vote as 'superseded'
-- (no vote_result fan-out: an internal migration marker, not a community
-- result), return its round to sourcing, and re-source it through the new
-- deterministic path immediately. select_candidate_vote_id is kept for audit.
update public.votes v
set status = 'closed',
    result = (
      select jsonb_build_object(
        'yes', count(*) filter (where choice = 'yes'),
        'no', count(*) filter (where choice = 'no'),
        'cast', count(*),
        'quorum', 0,
        'quorum_met', false,
        'outcome', 'superseded'
      )
      from public.vote_responses vr where vr.vote_id = v.id
    )
where v.type = 'select_candidate' and v.status = 'open';

update public.replacement_rounds
set status = 'selecting_candidates',
    candidate_pool = '{}',
    invited_user_id = null,
    updated_at = now()
where status = 'voting';

do $$
declare v_round record;
begin
  -- Only rounds that carried a candidate vote (the ones just reset above,
  -- plus any older no_quorum leftovers) are re-sourced here. Rounds that
  -- were already selecting with an empty pool keep their own attempts budget
  -- for the hourly cron path.
  for v_round in
    select * from public.replacement_rounds
    where status = 'selecting_candidates'
      and select_candidate_vote_id is not null
  loop
    perform public.source_candidates(v_round.id, null);
  end loop;
end; $$;

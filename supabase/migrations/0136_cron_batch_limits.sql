-- 0136_cron_batch_limits.sql
-- Perf/safety: the four pg_cron jobs (0015, 0039) each walked their whole table
-- (FOR x IN SELECT * WHERE expired LOOP) and did 4-6 sequential queries per row
-- plus notification fan-out in ONE transaction, with no LIMIT, no row locking,
-- and no guard against overlapping runs. 1k expired votes = 5k+ queries holding
-- locks for minutes; a retry or overlap could double-apply effects.
--
-- Re-created with identical per-row semantics; only the driving loop changes:
--   1. pg_advisory_xact_lock per job (named after the cron job) serializes
--      overlapping runs; a late tick waits instead of doubling the work.
--   2. ORDER BY deadline + LIMIT 100 + FOR UPDATE SKIP LOCKED bounds each tick;
--      the next tick picks up the remainder.
--   3. set_config statement_timeout caps a runaway tick (each interval is a
--      multiple of the budget, so a timeout always self-heals next tick).
--   4. close_expired_votes closes with WHERE status = 'open' and skips the
--      notification fan-out when another run already closed the row.
-- source_candidates itself is untouched (S-06).
--
-- Partial indexes below match the new driving predicates; the old
-- votes_open_idx (cluster_id, status, closes_at) cannot serve a
-- status-only scan.

create index votes_open_due_idx
  on public.votes (status, closes_at) where status = 'open';

create index replacement_rounds_status_idx
  on public.replacement_rounds (status);

create index invitations_pending_expires_idx
  on public.invitations (status, expires_at) where status = 'pending';

create index clusters_intro_deadline_idx
  on public.clusters (status, introductions_deadline) where status = 'introductions';

-- Live body is 0132 (which redefined 0013 with the cooldown-interval fn).
create or replace function public.close_expired_votes() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_vote record;
  v_yes int; v_no int; v_total int; v_active int; v_quorum int; v_mode matching_mode;
  v_winner uuid; v_result jsonb; v_updated int;
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

    elsif v_vote.type = 'select_candidate' then
      if v_total >= v_quorum then
        select choice into v_winner
        from public.vote_responses
        where vote_id = v_vote.id
        group by choice
        order by count(*) desc, min(created_at) asc
        limit 1;

        v_result := v_result || jsonb_build_object('outcome', coalesce(v_winner::text, 'none'));

        update public.replacement_rounds
        set status = 'inviting', invited_user_id = v_winner::uuid, updated_at = now()
        where select_candidate_vote_id = v_vote.id;

        perform public.create_invitation(
          (select id from public.replacement_rounds where select_candidate_vote_id = v_vote.id)
        );
      else
        v_result := v_result || jsonb_build_object('outcome', 'no_quorum');
        update public.replacement_rounds
        set status = 'selecting_candidates', updated_at = now()
        where select_candidate_vote_id = v_vote.id;
        perform public.source_candidates(
          (select id from public.replacement_rounds where select_candidate_vote_id = v_vote.id),
          v_vote.initiated_by
        );
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

create or replace function public.check_intro_deadlines() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster record;
  v_removed int;
begin
  perform pg_advisory_xact_lock(hashtext('intro-deadline'));
  perform set_config('statement_timeout', '120s', true);

  for v_cluster in
    select id from public.clusters
    where status = 'introductions' and introductions_deadline < now()
    order by introductions_deadline limit 100 for update skip locked
  loop
    -- remove non-completers (one round per cluster regardless of how many left)
    update public.cluster_members
    set left_at = now()
    where cluster_id = v_cluster.id
      and left_at is null
      and intro_completed_at is null;

    get diagnostics v_removed = row_count;

    if v_removed > 0 then
      perform public.start_replacement(v_cluster.id);
    end if;

    -- if every remaining active member has completed, unlock
    if not exists (
      select 1 from public.cluster_members
      where cluster_id = v_cluster.id and left_at is null and intro_completed_at is null
    ) and exists (
      select 1 from public.cluster_members
      where cluster_id = v_cluster.id and left_at is null
    ) then
      update public.clusters
      set introductions_completed_at = now(), status = 'active', updated_at = now()
      where id = v_cluster.id;
    end if;
  end loop;
end; $$;

create or replace function public.expire_invitations() returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record;
begin
  perform pg_advisory_xact_lock(hashtext('invite-expire'));
  perform set_config('statement_timeout', '120s', true);

  for v_inv in
    select * from public.invitations
    where status = 'pending' and expires_at < now()
    order by expires_at limit 100 for update skip locked
  loop
    update public.invitations set status = 'expired', responded_at = now()
    where id = v_inv.id;

    perform public.advance_round_on_invitation_void(v_inv.cluster_id, v_inv.user_id);
  end loop;
end; $$;

create or replace function public.progress_replacements() returns void
language plpgsql security definer set search_path = public as $$
declare v_round record; v_system uuid;
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
end; $$;

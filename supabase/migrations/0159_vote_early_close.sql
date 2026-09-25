-- 0159_vote_early_close.sql
--
-- Governance votes close early once decided instead of waiting for closes_at.
-- Bug context: mobile showed 1 of 3 votes needed because it counted RLS-visible
-- vote_responses rows; that client fix ships separately. This migration is the
-- timer half: vote_on() attempts an immediate close after each cast when the
-- result is mathematically fixed.
--
-- Decisive rule (quorum is floor(active/2)+1 at close time):
--   yes >= quorum closes as passed,
--   no >= quorum closes as failed (yes can no longer win),
--   total >= active closes with the normal pass/fail rule (covers below-quorum
--   ties such as 2 yes and 2 no with quorum 3).
-- Undecided votes still wait for closes_at via the unchanged cron path.
--
-- Shape: new close_single_vote(vote, early) helper holds the per-vote body.
-- close_expired_votes() keeps its advisory lock, timeout, LIMIT 100 SKIP LOCKED
-- loop and calls the helper with early=false. vote_on() keeps its guards,
-- validation, rate limit and upsert, then calls the helper with early=true.
-- Result json, replacement and rename effects, and vote_result fan-out are
-- identical in both paths. select_candidate strays still close as superseded
-- with no fan-out.

create or replace function public.close_single_vote(p_vote_id uuid, p_early boolean default false)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_vote record;
  v_yes int; v_no int; v_total int; v_active int; v_quorum int; v_mode matching_mode;
  v_result jsonb; v_updated int;
begin
  select * into v_vote from public.votes where id = p_vote_id for update;
  if not found then return false; end if;
  if v_vote.status <> 'open' then return false; end if;

  if v_vote.type = 'select_candidate' then
    if p_early then return false; end if;
    select count(*) filter (where choice = 'yes'),
           count(*) filter (where choice = 'no'),
           count(*)
      into v_yes, v_no, v_total
    from public.vote_responses where vote_id = v_vote.id;
    v_result := jsonb_build_object(
      'yes', v_yes, 'no', v_no, 'cast', v_total,
      'quorum', 0, 'quorum_met', false,
      'outcome', 'superseded'
    );
    update public.votes set status = 'closed', result = v_result
    where id = v_vote.id and status = 'open';
    return true;
  end if;

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

  if p_early then
    if not (v_yes >= v_quorum or v_no >= v_quorum or v_total >= v_active) then
      return false;
    end if;
  else
    if not (v_vote.closes_at < now()) then return false; end if;
  end if;

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
  end if;

  update public.votes set status = 'closed', result = v_result
  where id = v_vote.id and status = 'open';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return false; end if;

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select user_id, 'vote_result', v_vote.cluster_id,
         'Vote result: ' || (v_result->>'outcome'), null
  from public.cluster_members
  where cluster_id = v_vote.cluster_id and left_at is null;

  return true;
end; $$;

create or replace function public.close_expired_votes() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_vote record;
begin
  perform pg_advisory_xact_lock(hashtext('vote-close'));
  perform set_config('statement_timeout', '240s', true);

  for v_vote in
    select * from public.votes
    where status = 'open' and closes_at < now()
    order by closes_at limit 100 for update skip locked
  loop
    perform public.close_single_vote(v_vote.id, false);
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

  perform pg_advisory_xact_lock(hashtext('vote:' || p_vote_id::text));
  perform public.close_single_vote(p_vote_id, true);
end; $$;

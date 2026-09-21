-- 0141_source_candidates_inline.sql
-- S-06: inline candidate eligibility as joins/anti-joins inside
-- source_candidates() so the planner can use queue_entries_ready_idx
-- (mode, queue_key, joined_at) instead of evaluating the per-row
-- fn_candidate_eligible() predicate (3x EXISTS per queue row) and so the
-- top-up branch filters/joins in a single plan.
--
-- Behavior-preserving rewrite: the two candidate SELECTs apply exactly the
-- four fn_candidate_eligible() conditions as relational predicates —
--   1. profiles.onboarding_completed_at IS NOT NULL (inner join),
--   2. no active membership in ANY cluster of the same matching_mode
--      (NOT EXISTS over cluster_members + clusters, same predicate the
--      function and accept_invitation's already_in_cluster_of_mode use),
--   3. no active mode cooldown (LEFT JOIN mode_cooldowns on
--      (user_id, mode, available_at > now()) + IS NULL, equivalent to the
--      NOT EXISTS since (user_id, mode) is the primary key),
--   4. user not in declined_user_ids (same NOT = ANY(coalesce(...)) test) —
-- plus the branch-2 deduplication against the branch-1 pool (same
-- NOT = ANY(coalesce(v_pool, '{}')) test).
-- Everything else (advisory lock, attempts/pool_exhausted retry semantics,
-- single-candidate auto-invite, candidate-vote creation, notification
-- fan-out, open_mix handling which falls out of the same predicates since
-- its key is always 'open') is copied verbatim from 0014.
--
-- fn_candidate_eligible() is deliberately left intact (other code and the
-- generated types reference it; dropping it adds risk for zero gain).
-- No new index: branch 1 is served by queue_entries_ready_idx, the
-- cooldown check by the mode_cooldowns primary key, the membership check
-- by cluster_members_user_idx, and the profile check by the profiles
-- primary key. No RLS change (security definer, server-side only, no
-- grants added). No realtime/publication change.

create or replace function public.source_candidates(p_round_id uuid, p_system_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round record;
  v_pool uuid[];
  v_extra uuid[];
  v_vote_id uuid;
  v_attempts int;
  v_cluster_key text;
  v_active int;
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
    v_pool := v_pool || coalesce(v_extra, '{}');
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

  update public.replacement_rounds
  set candidate_pool = v_pool, status = 'voting', updated_at = now()
  where id = p_round_id;

  -- single candidate: auto-select, no vote
  if array_length(v_pool, 1) = 1 then
    update public.replacement_rounds
    set status = 'inviting', invited_user_id = v_pool[1], updated_at = now()
    where id = p_round_id;
    perform public.create_invitation(p_round_id);
    return;
  end if;

  -- two or more: cluster picks via a hidden candidate vote
  select count(*) into v_active
  from public.cluster_members
  where cluster_id = v_round.cluster_id and left_at is null;

  insert into public.votes (cluster_id, type, initiated_by)
  values (v_round.cluster_id, 'select_candidate', coalesce(p_system_user, v_pool[1]))
  returning id into v_vote_id;

  update public.replacement_rounds set select_candidate_vote_id = v_vote_id, updated_at = now()
  where id = p_round_id;

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select user_id, 'replacement', v_round.cluster_id,
         'Candidates are up for selection', 'Review and vote for your new cluster member'
  from public.cluster_members
  where cluster_id = v_round.cluster_id and left_at is null;
end; $$;

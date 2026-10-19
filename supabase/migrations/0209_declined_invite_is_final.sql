-- 0209_declined_invite_is_final.sql
-- A decline is final for a cluster, for every invite source. Created clusters
-- already enforce this at invite time (invite_to_created_cluster raises
-- previously_declined). Queue replacements only excluded a decliner for the
-- current replacement round via declined_user_ids, so a later round (new
-- vacancy, different round row with an empty exclusion list) could re-invite
-- the same person to the same cluster. This makes the declined invitation a
-- permanent per-cluster exclusion in candidate sourcing too, while expiring
-- and creator-cancelled created invites stay re-invitable.
--
-- source_candidates() is the live 0191 body (date modes unchanged; local and
-- open_mix keep the mutual age-preference filter) with a declined-invitation
-- test added to all four candidate SELECTs. fn_candidate_eligible() gains the
-- same predicate so it continues to mirror the shared inlined sourcing
-- predicates (see S-06 in governance.test.ts). No schema, RLS, grant, or
-- notification changes.

create or replace function public.fn_candidate_eligible(
  p_user_id uuid,
  p_cluster_id uuid,
  p_mode matching_mode,
  p_exclude uuid[]
) returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from public.profiles pr
      where pr.id = p_user_id and pr.onboarding_completed_at is not null
    )
    and not exists (
      select 1 from public.cluster_members cm
      join public.clusters c on c.id = cm.cluster_id
      where cm.user_id = p_user_id and cm.left_at is null and c.matching_mode = p_mode
    )
    and not exists (
      select 1 from public.mode_cooldowns mc
      where mc.user_id = p_user_id and mc.mode = p_mode and mc.available_at > now()
    )
    and not (p_user_id = any(coalesce(p_exclude, '{}')))
    and not exists (
      select 1 from public.invitations i
      where i.cluster_id = p_cluster_id
        and i.user_id = p_user_id
        and i.status = 'declined'
    );
$$;

create or replace function public.source_candidates(p_round_id uuid, p_system_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round record;
  v_pool uuid[];
  v_extra uuid[];
  v_attempts int;
  v_cluster_key text;
  v_cluster_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('replacement:' || p_round_id));

  select * into v_round from public.replacement_rounds where id = p_round_id;
  if v_round is null then return; end if;
  if v_round.status in ('closed', 'filled') then return; end if;

  v_attempts := v_round.attempts + 1;
  update public.replacement_rounds set attempts = v_attempts, updated_at = now()
  where id = p_round_id;

  select queue_key into v_cluster_key
  from public.clusters where id = v_round.cluster_id;
  v_cluster_id := v_round.cluster_id;

  if v_round.mode not in ('local', 'open_mix') then
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
          select 1 from public.invitations i
          where i.cluster_id = v_cluster_id
            and i.user_id = q.user_id
            and i.status = 'declined'
        )
        and not exists (
          select 1 from public.cluster_members cm
          join public.clusters c on c.id = cm.cluster_id
          where cm.user_id = q.user_id and cm.left_at is null and c.matching_mode = v_round.mode
        )
      order by q.joined_at
      limit 3
    ) q;

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
            select 1 from public.invitations i
            where i.cluster_id = v_cluster_id
              and i.user_id = q.user_id
              and i.status = 'declined'
          )
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
  else
    select array_agg(q.user_id) into v_pool
    from (
      select q.user_id
      from public.queue_entries q
      join public.profiles cand
        on cand.id = q.user_id
       and cand.onboarding_completed_at is not null
       and cand.dob is not null
      left join public.mode_cooldowns mc
        on mc.user_id = q.user_id
       and mc.mode = v_round.mode
       and mc.available_at > now()
      where q.mode = v_round.mode
        and q.queue_key = v_cluster_key
        and mc.user_id is null
        and not (q.user_id = any(coalesce(v_round.declined_user_ids, '{}')))
        and not exists (
          select 1 from public.invitations i
          where i.cluster_id = v_cluster_id
            and i.user_id = q.user_id
            and i.status = 'declined'
        )
        and not exists (
          select 1 from public.cluster_members cm
          join public.clusters c on c.id = cm.cluster_id
          where cm.user_id = q.user_id and cm.left_at is null and c.matching_mode = v_round.mode
        )
        and not exists (
          select 1
          from public.cluster_members cm
          join public.profiles mem on mem.id = cm.user_id
          where cm.cluster_id = v_cluster_id
            and cm.left_at is null
            and mem.dob is not null
            and not public.local_age_compatible(
              case when v_round.mode = 'local' then cand.local_pref_age_min else cand.open_mix_pref_age_min end,
              case when v_round.mode = 'local' then cand.local_pref_age_max else cand.open_mix_pref_age_max end,
              public.age_of(cand.dob),
              case when v_round.mode = 'local' then mem.local_pref_age_min else mem.open_mix_pref_age_min end,
              case when v_round.mode = 'local' then mem.local_pref_age_max else mem.open_mix_pref_age_max end,
              public.age_of(mem.dob))
        )
      order by q.joined_at
      limit 3
    ) q;

    if coalesce(array_length(v_pool, 1), 0) < 3 then
      select array_agg(u) into v_extra
      from (
        select q.user_id as u
        from public.queue_entries q
        join public.profiles cand
          on cand.id = q.user_id
         and cand.onboarding_completed_at is not null
         and cand.dob is not null
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
            select 1 from public.invitations i
            where i.cluster_id = v_cluster_id
              and i.user_id = q.user_id
              and i.status = 'declined'
          )
          and not exists (
            select 1 from public.cluster_members cm
            join public.clusters c on c.id = cm.cluster_id
            where cm.user_id = q.user_id and cm.left_at is null and c.matching_mode = v_round.mode
          )
          and not exists (
            select 1
            from public.cluster_members cm
            join public.profiles mem on mem.id = cm.user_id
            where cm.cluster_id = v_cluster_id
              and cm.left_at is null
              and mem.dob is not null
              and not public.local_age_compatible(
                case when v_round.mode = 'local' then cand.local_pref_age_min else cand.open_mix_pref_age_min end,
                case when v_round.mode = 'local' then cand.local_pref_age_max else cand.open_mix_pref_age_max end,
                public.age_of(cand.dob),
                case when v_round.mode = 'local' then mem.local_pref_age_min else mem.open_mix_pref_age_min end,
                case when v_round.mode = 'local' then mem.local_pref_age_max else mem.open_mix_pref_age_max end,
                public.age_of(mem.dob))
          )
        order by q.joined_at
        limit (3 - coalesce(array_length(v_pool, 1), 0))
      ) t;
      v_pool := coalesce(v_pool, '{}') || coalesce(v_extra, '{}');
    end if;
  end if;

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
  set candidate_pool = array[v_pool[1]], status = 'inviting', invited_user_id = v_pool[1],
      select_candidate_vote_id = null, updated_at = now()
  where id = p_round_id;
  perform public.create_invitation(p_round_id);
  return;
end; $$;

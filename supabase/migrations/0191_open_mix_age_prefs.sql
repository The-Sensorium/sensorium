-- 0191_open_mix_age_prefs.sql
-- Optional mutual age-only filter for Open Mix, mirroring 0190 (Local).
-- 1) profiles.open_mix_pref_age_min/max, null/null means Any age.
--    Separate columns from local_pref_* so the two modes never couple:
--    setting a Local range must not silently narrow Open Mix.
-- 2) set_open_mix_age_prefs() writer + get_open_mix_compatible_count() counter.
-- 3) maybe_form_cluster() filtered branch covers local + open_mix
--    (greedy 8-way mutual clique, each waiter tried as seed).
-- 4) source_candidates() filtered branch covers local + open_mix
--    (candidate must be mutually compatible with all remaining members).
-- 5) No get_member_profiles change: Open Mix already exposes birth_year,
--    so the filter adds no new exposure (unlike Local, which suppresses it).
-- Reuses age_of() + local_age_compatible() from 0190 as-is; the local_
-- prefix is historical, the math is mode-agnostic.
-- Live bodies: maybe_form_cluster is 0190:132-220, source_candidates is
-- 0190:225-398. Never edit those files.

alter table public.profiles
  add column if not exists open_mix_pref_age_min smallint;
alter table public.profiles
  add column if not exists open_mix_pref_age_max smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'open_mix_pref_age_allowed'
  ) then
    alter table public.profiles
      add constraint open_mix_pref_age_allowed
      check (
        (open_mix_pref_age_min is null and open_mix_pref_age_max is null)
        or (
          open_mix_pref_age_min is not null
          and open_mix_pref_age_max is not null
          and open_mix_pref_age_min >= 18
          and open_mix_pref_age_max <= 99
          and open_mix_pref_age_min <= open_mix_pref_age_max
        )
      );
  end if;
end $$;

create or replace function public.set_open_mix_age_prefs(p_min smallint default null, p_max smallint default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if not (p_min is null and p_max is null)
     and not (p_min is not null and p_max is not null and p_min >= 18 and p_max <= 99 and p_min <= p_max)
  then
    raise exception 'invalid_age_range';
  end if;
  update public.profiles
  set open_mix_pref_age_min = p_min,
      open_mix_pref_age_max = p_max
  where id = auth.uid();
end; $$;

grant execute on function public.set_open_mix_age_prefs(smallint, smallint) to authenticated;

create or replace function public.get_open_mix_compatible_count(p_queue_key text, p_min smallint default null, p_max smallint default null)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_dob date;
  v_age smallint;
  v_min smallint;
  v_max smallint;
  v_count int;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select dob, open_mix_pref_age_min, open_mix_pref_age_max
    into v_dob, v_min, v_max
  from public.profiles where id = v_user_id;

  if p_min is not null or p_max is not null then
    if p_min is null or p_max is null
       or p_min < 18 or p_max > 99 or p_min > p_max then
      raise exception 'invalid_age_range';
    end if;
    v_min := p_min;
    v_max := p_max;
  end if;

  if v_dob is null then raise exception 'complete onboarding first'; end if;
  v_age := public.age_of(v_dob);

  select count(*)::int into v_count
  from public.queue_entries q
  join public.profiles pr on pr.id = q.user_id
  where q.mode = 'open_mix'
    and q.queue_key = p_queue_key
    and q.user_id <> v_user_id
    and pr.dob is not null
    and public.local_age_compatible(v_min, v_max, v_age, pr.open_mix_pref_age_min, pr.open_mix_pref_age_max, public.age_of(pr.dob));

  return v_count;
end; $$;

grant execute on function public.get_open_mix_compatible_count(text, smallint, smallint) to authenticated;

-- maybe_form_cluster: live body is 0190. Date modes keep the byte-identical
-- plain first-8 path. Local + open_mix share the greedy earliest-formable
-- 8-clique (each waiter tried as seed in joined_at order), parameterized
-- by p_mode with a mode-selected pref pair, so a narrow head waiter cannot
-- stall the queue; they simply keep waiting.
create or replace function public.maybe_form_cluster(p_mode matching_mode, p_queue_key text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_users uuid[];
  v_cluster_id uuid;
  v_label text;
  v_count int;
  v_ids uuid[];
  v_ages smallint[];
  v_mins smallint[];
  v_maxs smallint[];
  v_set int[];
  m int;
  v_ok boolean;
begin
  perform pg_advisory_xact_lock(hashtext('cluster:' || p_mode || ':' || p_queue_key));

  if p_mode not in ('local', 'open_mix') then
    select count(*) into v_count
    from public.queue_entries where mode = p_mode and queue_key = p_queue_key;
    if v_count < 8 then return; end if;

    select array_agg(user_id order by joined_at)
      into v_users
    from (
      select user_id, joined_at from public.queue_entries
      where mode = p_mode and queue_key = p_queue_key
      order by joined_at limit 8
    ) t;
  else
    -- Earliest formable 8-clique wins. Each waiter is tried as seed in
    -- joined_at order, so one narrow user at the head cannot stall everyone
    -- behind them; they simply keep waiting (see the longer-wait warning).
    select array_agg(q.user_id order by q.joined_at),
           array_agg(public.age_of(pr.dob) order by q.joined_at),
           array_agg(case when p_mode = 'local' then pr.local_pref_age_min else pr.open_mix_pref_age_min end order by q.joined_at),
           array_agg(case when p_mode = 'local' then pr.local_pref_age_max else pr.open_mix_pref_age_max end order by q.joined_at)
      into v_ids, v_ages, v_mins, v_maxs
    from public.queue_entries q
    join public.profiles pr on pr.id = q.user_id
    where q.mode = p_mode and q.queue_key = p_queue_key
      and pr.dob is not null;
    v_users := '{}';
    for i in 1..coalesce(array_length(v_ids, 1), 0) loop
      v_set := array[i];
      for j in 1..coalesce(array_length(v_ids, 1), 0) loop
        if j = i then continue; end if;
        if array_length(v_set, 1) >= 8 then exit; end if;
        v_ok := true;
        foreach m in array v_set loop
          if not public.local_age_compatible(
            v_mins[j], v_maxs[j], v_ages[j], v_mins[m], v_maxs[m], v_ages[m]) then
            v_ok := false;
            exit;
          end if;
        end loop;
        if v_ok then v_set := v_set || j; end if;
      end loop;
      if array_length(v_set, 1) >= 8 then
        select array_agg(v_ids[u.idx] order by u.idx) into v_users from unnest(v_set) as u(idx);
        exit;
      end if;
    end loop;

    if coalesce(array_length(v_users, 1), 0) < 8 then return; end if;
  end if;

  v_label := public.fn_mode_label(p_mode, p_queue_key);

  insert into public.clusters (name, matching_mode, mode_label, queue_key, status, introductions_completed_at, introductions_deadline)
  values (v_label || ' Cluster', p_mode, v_label, p_queue_key, 'active', now(), null)
  returning id into v_cluster_id;

  insert into public.cluster_members (cluster_id, user_id)
  select v_cluster_id, unnest(v_users);

  delete from public.queue_entries
  where mode = p_mode and queue_key = p_queue_key
    and user_id = any (v_users);

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select u, 'cluster_formed', v_cluster_id,
         'Your cluster is ready',
         'Say hello, and answer the intro questions when you are ready.',
         jsonb_build_object('cluster_id', v_cluster_id, 'mode', p_mode::text)
  from unnest(v_users) as u;

  perform pg_notify('queue_update', jsonb_build_object('mode', p_mode, 'queue_key', p_queue_key)::text);
end; $$;

-- source_candidates: live body is 0190. Date modes unchanged.
-- Local + open_mix keep the same-queue-first then top-up shape, but every
-- candidate must be mutually compatible with all remaining members, using
-- the mode-selected pref pair.
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

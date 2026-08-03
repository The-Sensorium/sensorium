-- 014_replacement_functions.sql

create function public.fn_candidate_eligible(
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
    and not (p_user_id = any(coalesce(p_exclude, '{}')));
$$;

create function public.leave_cluster(p_cluster_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_mode matching_mode;
begin
  if not public.is_active_member(p_cluster_id) then raise exception 'not_a_member'; end if;

  select matching_mode into v_mode from public.clusters where id = p_cluster_id;

  update public.cluster_members set left_at = now()
  where cluster_id = p_cluster_id and user_id = auth.uid();

  insert into public.mode_cooldowns (user_id, mode, available_at)
  values (auth.uid(), v_mode, now() + interval '30 days')
  on conflict (user_id, mode) do update set available_at = excluded.available_at;

  perform public.start_replacement(p_cluster_id);
end; $$;

-- Vacancy entry point. Closes any in-flight round (one at a time per cluster).
create function public.start_replacement(p_cluster_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_round_id uuid;
  v_mode matching_mode;
  v_system uuid;
begin
  perform pg_advisory_xact_lock(hashtext('replacement:' || p_cluster_id));

  update public.replacement_rounds
  set status = 'closed', closed_reason = 'superseded', updated_at = now()
  where cluster_id = p_cluster_id and status in ('selecting_candidates', 'voting', 'inviting');

  select matching_mode into v_mode from public.clusters where id = p_cluster_id;

  select user_id into v_system from public.cluster_members
  where cluster_id = p_cluster_id and left_at is null
  order by joined_at limit 1;

  insert into public.replacement_rounds (cluster_id, mode, status)
  values (p_cluster_id, v_mode, 'selecting_candidates')
  returning id into v_round_id;

  perform public.source_candidates(v_round_id, v_system);

  return v_round_id;
end; $$;

-- Builds/rebuilds the candidate pool and advances the round.
create function public.source_candidates(p_round_id uuid, p_system_user uuid) returns void
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
    where q.mode = v_round.mode
      and q.queue_key = v_cluster_key
      and public.fn_candidate_eligible(q.user_id, v_round.cluster_id, v_round.mode, v_round.declined_user_ids)
    order by q.joined_at
    limit 3
  ) q;

  -- 2) top-up from any queue in the mode
  if coalesce(array_length(v_pool, 1), 0) < 3 then
    select array_agg(u) into v_extra
    from (
      select q.user_id as u
      from public.queue_entries q
      where q.mode = v_round.mode
        and q.queue_key <> v_cluster_key
        and public.fn_candidate_eligible(q.user_id, v_round.cluster_id, v_round.mode, v_round.declined_user_ids)
        and not (q.user_id = any(coalesce(v_pool, '{}')))
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

-- Sends the invitation for a round in `inviting` state.
create function public.create_invitation(p_round_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_round record;
begin
  select * into v_round from public.replacement_rounds where id = p_round_id;
  if v_round.status <> 'inviting' or v_round.invited_user_id is null then return; end if;

  insert into public.invitations (cluster_id, user_id)
  values (v_round.cluster_id, v_round.invited_user_id);

  insert into public.notifications (user_id, type, cluster_id, title, body)
  values (v_round.invited_user_id, 'invitation_received', v_round.cluster_id,
          'You have been invited to join a cluster', null);
end; $$;

-- Advances the round after a candidate declines or their invitation expires.
create function public.advance_round_on_invitation_void(p_cluster_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_round uuid; v_system uuid;
begin
  select id into v_round from public.replacement_rounds
  where cluster_id = p_cluster_id and status = 'inviting'
  order by created_at desc limit 1;

  if v_round is null then return; end if;

  update public.replacement_rounds
  set declined_user_ids = array_append(declined_user_ids, p_user_id),
      status = 'selecting_candidates',
      invited_user_id = null,
      updated_at = now()
  where id = v_round;

  select user_id into v_system from public.cluster_members
  where cluster_id = p_cluster_id and left_at is null
  order by joined_at limit 1;

  perform public.source_candidates(v_round, v_system);
end; $$;

-- Cron: re-source empty pools, close exhausted rounds.
create function public.progress_replacements() returns void
language plpgsql security definer set search_path = public as $$
declare v_round record; v_system uuid;
begin
  for v_round in
    select * from public.replacement_rounds
    where status = 'selecting_candidates'
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

create function public.accept_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record;
begin
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

  update public.invitations set status = 'accepted', responded_at = now()
  where id = p_invitation_id;

  insert into public.cluster_members (cluster_id, user_id)
  values (v_inv.cluster_id, v_inv.user_id);

  delete from public.queue_entries where user_id = v_inv.user_id;

  update public.clusters
  set introductions_deadline = greatest(
        coalesce(introductions_deadline, now()),
        now() + interval '72 hours'
      )
  where id = v_inv.cluster_id and status = 'introductions';

  update public.replacement_rounds
  set status = 'filled', invited_user_id = v_inv.user_id, updated_at = now()
  where cluster_id = v_inv.cluster_id and status = 'inviting';

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select user_id, 'replacement', v_inv.cluster_id, 'A new member has joined', null
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null;
end; $$;

create function public.decline_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record;
begin
  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv.user_id <> auth.uid() then raise exception 'not_yours'; end if;

  update public.invitations set status = 'declined', responded_at = now()
  where id = p_invitation_id and status = 'pending';

  perform public.advance_round_on_invitation_void(v_inv.cluster_id, v_inv.user_id);
end; $$;

create function public.expire_invitations() returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record;
begin
  for v_inv in
    select * from public.invitations
    where status = 'pending' and expires_at < now()
  loop
    update public.invitations set status = 'expired', responded_at = now()
    where id = v_inv.id;

    perform public.advance_round_on_invitation_void(v_inv.cluster_id, v_inv.user_id);
  end loop;
end; $$;

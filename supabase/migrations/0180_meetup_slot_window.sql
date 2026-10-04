-- 0180_meetup_slot_window.sql
-- Enforce the client slot window server-side. Previously create_meetup only
-- checked starts > now() and voting_closes < earliest, so a crafted RPC call
-- could propose slots minutes out with voting closing just before start.
-- Now every slot must sit between now + 3 hours and now + 7 days, and voting
-- must close at least 1 hour before the earliest slot.

create or replace function public.create_meetup(
  p_cluster_id uuid,
  p_slots jsonb,
  p_voting_closes_at timestamptz,
  p_week_label text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_status public.cluster_status;
  v_meetup_id uuid;
  v_slot jsonb;
  v_starts timestamptz;
  v_ends timestamptz;
  v_min_starts timestamptz;
  v_count int;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  perform public.assert_account_can_write();
  if not public.is_active_member(p_cluster_id) then raise exception 'not_member'; end if;

  select status into v_status from public.clusters where id = p_cluster_id;
  if not found then raise exception 'cluster_not_found'; end if;
  if v_status <> 'active' then raise exception 'cluster_not_ready'; end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'invalid_slots';
  end if;
  v_count := jsonb_array_length(p_slots);
  if v_count < 2 or v_count > 5 then raise exception 'invalid_slots'; end if;

  if p_voting_closes_at is null or p_voting_closes_at <= now() then
    raise exception 'invalid_voting_window';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_cluster_id::text, 0));

  if exists (
    select 1 from public.meetups
    where cluster_id = p_cluster_id
      and status in ('proposed', 'voting', 'confirmed', 'starting', 'active')
  ) then
    raise exception 'meetup_active';
  end if;

  perform public.check_rate_limit('meetup', 5, interval '1 day');

  v_min_starts := null;
  for v_slot in select * from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(v_slot) <> 'object' then raise exception 'invalid_slots'; end if;
    begin
      v_starts := (v_slot ->> 'starts_at')::timestamptz;
      v_ends := (v_slot ->> 'ends_at')::timestamptz;
    exception when others then
      raise exception 'invalid_slots';
    end;
    if v_starts is null or v_ends is null then raise exception 'invalid_slots'; end if;
    if v_starts <= now() then raise exception 'slot_in_past'; end if;
    if v_starts < now() + interval '3 hours' then raise exception 'slot_too_soon'; end if;
    if v_starts > now() + interval '7 days' then raise exception 'slot_too_far'; end if;
    if v_ends <= v_starts then raise exception 'invalid_slots'; end if;
    if v_min_starts is null or v_starts < v_min_starts then
      v_min_starts := v_starts;
    end if;
  end loop;

  if p_voting_closes_at >= v_min_starts then
    raise exception 'invalid_voting_window';
  end if;
  if p_voting_closes_at > v_min_starts - interval '1 hour' then
    raise exception 'invalid_voting_window';
  end if;

  insert into public.meetups (cluster_id, created_by, status, voting_closes_at, week_label)
  values (p_cluster_id, v_me, 'voting', p_voting_closes_at, nullif(btrim(coalesce(p_week_label, '')), ''))
  returning id into v_meetup_id;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    v_starts := (v_slot ->> 'starts_at')::timestamptz;
    v_ends := (v_slot ->> 'ends_at')::timestamptz;
    insert into public.meetup_slots (meetup_id, starts_at, ends_at, created_by)
    values (v_meetup_id, v_starts, v_ends, v_me);
  end loop;

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select cm.user_id, 'meetup_invite', p_cluster_id,
         'Vote for this week''s Cluster Meetup',
         'Pick a time for a casual group call.',
         jsonb_build_object('meetup_id', v_meetup_id)
  from public.cluster_members cm
  where cm.cluster_id = p_cluster_id
    and cm.left_at is null
    and cm.user_id is distinct from v_me;

  return v_meetup_id;
end; $$;

revoke all on function public.create_meetup(uuid, jsonb, timestamptz, text) from public, anon;
grant execute on function public.create_meetup(uuid, jsonb, timestamptz, text) to authenticated;
grant execute on function public.create_meetup(uuid, jsonb, timestamptz, text) to service_role;

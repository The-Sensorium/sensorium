-- 0129_join_queue_radius_fallback.sql
-- Local queue join failed with `location_not_set` right after updating the
-- location from the cluster page (web + mobile). The page updates `profiles`
-- then refetches only `matching-status`; the cached `profiles` row still
-- holds the old (often null) `local_radius_km`, so JoinCard sends a stale or
-- missing `p_radius_km` until a reload/app restart refetches the profile.
-- Make `join_queue` resilient: prefer the stored profile radius (source of
-- truth after a location save), falling back to the caller-supplied param
-- only when the profile has none yet. Signatures and grants are unchanged.

create or replace function public.join_queue(p_mode matching_mode, p_radius_km int default null)
returns table (queue_key text, waiting int)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_radius int;
  v_key text;
  v_count int;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  perform public.assert_account_can_write();

  select * into v_profile from public.profiles where id = v_user_id;
  if v_profile.dob is null then raise exception 'complete onboarding first'; end if;

  if exists (
    select 1 from public.mode_cooldowns
    where user_id = v_user_id and mode = p_mode and available_at > now()
  ) then raise exception 'cooldown_active'; end if;

  if exists (
    select 1 from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    where cm.user_id = v_user_id and cm.left_at is null and c.matching_mode = p_mode
  ) then raise exception 'already_in_cluster_of_mode'; end if;

  if p_mode = 'local' then
    v_radius := coalesce(v_profile.local_radius_km, p_radius_km);
    if v_profile.latitude is null or v_profile.local_area is null or v_radius is null then
      raise exception 'location_not_set';
    end if;
    if v_profile.local_radius_km is null then
      update public.profiles set local_radius_km = v_radius where id = v_user_id;
    end if;
    delete from public.queue_entries
    where user_id = v_user_id and mode = 'local';
  else
    v_radius := p_radius_km;
  end if;

  v_key := public.fn_queue_key(p_mode, v_profile.dob, v_profile.country_code, v_profile.local_area, v_radius);

  insert into public.queue_entries (user_id, mode, queue_key)
  values (v_user_id, p_mode, v_key)
  on conflict on constraint one_queue_per_mode do nothing;

  select count(*) into v_count
  from public.queue_entries q where q.mode = p_mode and q.queue_key = v_key;

  return query select v_key, v_count;
end; $$;

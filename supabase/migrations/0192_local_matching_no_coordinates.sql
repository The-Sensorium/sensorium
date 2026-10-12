-- 0192_local_matching_no_coordinates.sql
-- Local Radius matching keys off the reverse-geocoded area slug
-- (local_area/local_country_code) and the chosen radius, never the raw fix.
-- Devices stopped persisting coordinates; relax join_queue's local guard to
-- require only the area slug, which is the value the queue key actually uses.
--
-- profiles.latitude / profiles.longitude stay in the schema (now unused) so
-- generated types and integration fixtures are unaffected. Existing stored
-- values are nulled out here; clients no longer write them.

create or replace function public.join_queue(p_mode matching_mode, p_radius_km int default null)
returns table (queue_key text, waiting int)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_radius int;
  v_country text;
  v_key text;
  v_count int;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  perform public.assert_account_can_write();

  select * into v_profile from public.profiles where id = v_user_id;
  if v_profile.dob is null then raise exception 'complete onboarding first'; end if;

  if p_mode = 'birth_month' then raise exception 'mode_retired'; end if;

  if exists (
    select 1 from public.mode_cooldowns
    where user_id = v_user_id and mode = p_mode and available_at > now()
  ) then raise exception 'cooldown_active'; end if;

  if exists (
    select 1 from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    where cm.user_id = v_user_id and cm.left_at is null
      and c.matching_mode = p_mode and c.origin = 'queue'
  ) then raise exception 'already_in_cluster_of_mode'; end if;

  perform public.check_rate_limit('join_queue', 20, interval '1 hour');

  if p_mode = 'local' then
    v_radius := coalesce(v_profile.local_radius_km, p_radius_km);
    if v_profile.local_area is null or v_radius is null then
      raise exception 'location_not_set';
    end if;
    if v_radius not in (10, 50, 100) then
      raise exception 'invalid_radius';
    end if;
    if v_profile.local_radius_km is null then
      update public.profiles set local_radius_km = v_radius where id = v_user_id;
    end if;
    delete from public.queue_entries
    where user_id = v_user_id and mode = 'local';
  else
    v_radius := p_radius_km;
  end if;

  if p_mode = 'local' then
    v_country := coalesce(v_profile.local_country_code, v_profile.country_code);
  else
    v_country := v_profile.country_code;
  end if;

  v_key := public.fn_queue_key(p_mode, v_profile.dob, v_country, v_profile.local_area, v_radius);

  insert into public.queue_entries (user_id, mode, queue_key)
  values (v_user_id, p_mode, v_key)
  on conflict on constraint one_queue_per_mode do nothing;

  select count(*) into v_count
  from public.queue_entries q where q.mode = p_mode and q.queue_key = v_key;

  return query select v_key, v_count;
end; $$;

-- Null out coordinates already stored so no row keeps a precise fix.
update public.profiles
set latitude = null, longitude = null
where latitude is not null or longitude is not null;
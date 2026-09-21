-- 0147 - Generation mode replaces birth_month (beta-only cleanup + rewrites).
-- Product is beta-only: all month queues/clusters/cooldowns are deleted, not
-- migrated. The 'birth_month' enum value stays in the type (PG cannot drop a
-- value without rebuilding dependents); it is retired via the join_queue guard
-- below plus UI removal. Follows 0146 (enum value must exist).

-- Beta-only cleanup: children before parents where no cascade, clusters last.
-- reports.cluster_id (0009) has no ON DELETE CASCADE, so clear it explicitly;
-- every other cluster child cascades (verify: grep "references public.clusters(id)").
delete from public.queue_entries where mode = 'birth_month';
delete from public.mode_cooldowns where mode = 'birth_month';
delete from public.reports where cluster_id in (
  select id from public.clusters where matching_mode = 'birth_month'
);
delete from public.clusters where matching_mode = 'birth_month';

-- fn_queue_key: live body is 0132, plus the generation branch. The birth_month
-- branch is deprecated (beta cleanup above) but retained so stray rows never
-- yield null keys.
-- Generation bands are 0-anchored 5-year cohorts: start = floor(year/5)*5,
-- key = 'start-end' with end = start + 4 (e.g. 1996 -> '1995-1999').
-- Boundaries: 1999-12-31 -> '1995-1999', 2000-01-01 -> '2000-2004'.
create or replace function public.fn_queue_key(
  p_mode matching_mode,
  p_dob date,
  p_country text,
  p_area text,
  p_radius int
) returns text
language sql immutable as $$
  select case p_mode
    when 'exact_birthdate' then to_char(p_dob, 'YYYY-MM-DD')
    when 'birth_year_month' then to_char(p_dob, 'YYYY-MM')
    when 'birth_month' then to_char(p_dob, 'MM')
    when 'birth_year' then to_char(p_dob, 'YYYY')
    when 'generation' then
      ((extract(year from p_dob)::int / 5 * 5)::text || '-' || ((extract(year from p_dob)::int / 5 * 5) + 4)::text)
    when 'local' then upper(coalesce(p_country, '')) || ':' || coalesce(p_area, 'unknown') || ':' || coalesce(p_radius, 0)::text
    when 'open_mix' then 'open'
  end;
$$;

-- fn_mode_label: live body is 0132:32-45, plus the generation branch.
-- maybe_form_cluster names clusters 'Born 2000-2004 Cluster' via this label,
-- same pattern as the other modes.
create or replace function public.fn_mode_label(p_mode matching_mode, p_key text) returns text
language sql
immutable
set search_path = public
as $function$
  select case p_mode
    when 'exact_birthdate' then to_char(to_date(p_key, 'YYYY-MM-DD'), 'FMMonth DD, YYYY')
    when 'birth_year_month' then replace(to_char(to_date(p_key || '-01', 'YYYY-MM'), 'FMMonth'), ' ', '') || ' ' || split_part(p_key, '-', 1)
    when 'birth_month' then to_char(to_date(p_key || '/01', 'MM/DD'), 'FMMonth')
    when 'birth_year' then p_key
    when 'generation' then 'Born ' || p_key
    when 'local' then 'Within ' || split_part(p_key, ':', 3) || 'km of ' || replace(split_part(p_key, ':', 2), '-', ' ')
    when 'open_mix' then 'Open Mix'
  end;
$function$;

-- join_queue: live body is 0138 (rate-limited wrapper), plus the birth_month
-- retire guard. Generation needs no special-casing (no radius, no location);
-- the 1-active-generation-cluster rule comes free via already_in_cluster_of_mode
-- and the 30-day cooldown via the fn_cooldown_interval else branch.
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

  if p_mode = 'birth_month' then raise exception 'mode_retired'; end if;

  if exists (
    select 1 from public.mode_cooldowns
    where user_id = v_user_id and mode = p_mode and available_at > now()
  ) then raise exception 'cooldown_active'; end if;

  if exists (
    select 1 from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    where cm.user_id = v_user_id and cm.left_at is null and c.matching_mode = p_mode
  ) then raise exception 'already_in_cluster_of_mode'; end if;

  perform public.check_rate_limit('join_queue', 20, interval '1 hour');

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

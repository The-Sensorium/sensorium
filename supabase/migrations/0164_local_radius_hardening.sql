-- 0164_local_radius_hardening.sql
-- Local radius picker hardening + traveler fix (plan docs/LOCAL_RADIUS_IMPROVEMENT_PLAN.md).
-- 1) Add profiles.local_country_code so Local queue keys use located country,
--    not profile country_code (travelers, expats, border metros).
-- 2) Guard local_radius_km to the fixed buckets [10, 50, 100] at DB + RPC level.
-- Live bodies: join_queue is 0147 (rate-limited wrapper over 0129 fallback),
-- get_my_matching_status is 0135 (scoped counts + cluster_id). Never edit those
-- files; this migration replaces both functions.

alter table public.profiles add column if not exists local_country_code text;

update public.profiles
set local_country_code = country_code
where local_area is not null and local_country_code is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'local_radius_allowed'
  ) then
    alter table public.profiles
      add constraint local_radius_allowed
      check (local_radius_km is null or local_radius_km in (10, 50, 100));
  end if;
end $$;

-- join_queue: live body is 0147:66. Changes: invalid_radius guard for local,
-- queue key uses coalesce(local_country_code, country_code) so legacy rows
-- without a located country keep their old key until their next locate.
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
    where cm.user_id = v_user_id and cm.left_at is null and c.matching_mode = p_mode
  ) then raise exception 'already_in_cluster_of_mode'; end if;

  perform public.check_rate_limit('join_queue', 20, interval '1 hour');

  if p_mode = 'local' then
    v_radius := coalesce(v_profile.local_radius_km, p_radius_km);
    if v_profile.latitude is null or v_profile.local_area is null or v_radius is null then
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

-- get_my_matching_status: live body is 0135 (scoped counts + cluster_id).
-- Change: derive local keys from coalesce(local_country_code, country_code).
drop function if exists public.get_my_matching_status();

create function public.get_my_matching_status()
returns table (
  mode matching_mode,
  queue_key text,
  label text,
  joined boolean,
  waiting int,
  cluster_id uuid
)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (
    select dob, country_code, local_country_code, local_area, local_radius_km
    from public.profiles
    where id = auth.uid()
  ),
  keys as (
    select m.mode,
      case
        when m.mode = 'local' and me.local_area is not null
          then public.fn_queue_key(m.mode, me.dob, coalesce(me.local_country_code, me.country_code), me.local_area, me.local_radius_km)
        when m.mode = 'open_mix'
          then public.fn_queue_key(m.mode, me.dob, coalesce(me.local_country_code, me.country_code), me.local_area, me.local_radius_km)
        when m.mode <> 'local'
          then public.fn_queue_key(m.mode, me.dob, coalesce(me.local_country_code, me.country_code), me.local_area, me.local_radius_km)
      end as queue_key
    from me, unnest(enum_range(null::matching_mode)) as m(mode)
  ),
  counts as (
    select q.mode, q.queue_key, count(*)::int as waiting
    from public.queue_entries q
    join keys k on k.mode = q.mode and k.queue_key = q.queue_key
    group by q.mode, q.queue_key
  )
  select k.mode,
         k.queue_key,
         public.fn_mode_label(k.mode, k.queue_key) as label,
         exists (
           select 1 from public.queue_entries q
           where q.user_id = auth.uid() and q.mode = k.mode
         ) as joined,
         coalesce(c.waiting, 0) as waiting,
         (
           select cm.cluster_id
           from public.cluster_members cm
           join public.clusters cl on cl.id = cm.cluster_id
           where cm.user_id = auth.uid()
             and cm.left_at is null
             and cl.matching_mode = k.mode
           limit 1
         ) as cluster_id
  from keys k
  left join counts c on c.mode = k.mode and c.queue_key = k.queue_key
  order by k.mode::text;
$function$;

grant execute on function public.get_my_matching_status() to authenticated;

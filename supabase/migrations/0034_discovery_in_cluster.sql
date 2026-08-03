-- 0034_discovery_in_cluster.sql
-- get_my_matching_status now reports the active cluster (if any) for each
-- matching mode, so Discovery can surface "you're already in a cluster" instead
-- of offering a queue join the backend would reject.

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
    select dob, country_code, local_area, local_radius_km
    from public.profiles
    where id = auth.uid()
  ),
  keys as (
    select m.mode,
      case
        when m.mode = 'local' and me.local_area is not null
          then public.fn_queue_key(m.mode, me.dob, me.country_code, me.local_area, me.local_radius_km)
        when m.mode <> 'local'
          then public.fn_queue_key(m.mode, me.dob, me.country_code, me.local_area, me.local_radius_km)
      end as queue_key
    from me, unnest(enum_range(null::matching_mode)) as m(mode)
  ),
  counts as (
    select mode, queue_key, count(*)::int as waiting
    from public.queue_entries
    group by mode, queue_key
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

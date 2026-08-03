-- 0018_get_my_matching_status.sql
-- Discovery + Queue pages: one call returning the signed-in user's queue key,
-- label, join state, and current waiting count for every matching mode.
-- Keeps the queue-key derivation (fn_queue_key) on the server.

create function public.get_my_matching_status()
returns table (
  mode matching_mode,
  queue_key text,
  label text,
  joined boolean,
  waiting int
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
         coalesce(c.waiting, 0) as waiting
  from keys k
  left join counts c on c.mode = k.mode and c.queue_key = k.queue_key
  order by k.mode::text;
$function$;

grant execute on function public.get_my_matching_status() to authenticated;

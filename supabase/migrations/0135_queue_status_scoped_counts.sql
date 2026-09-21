-- 0135_queue_status_scoped_counts.sql
-- Perf: get_my_matching_status aggregated the ENTIRE queue_entries table
-- (counts CTE: group by mode, queue_key with no filter) on every Discovery /
-- Clusters render, plus useQueueCount polled get_queue_count every 15s per
-- card. At 10k queued users that is a seconds-long seq-scan + hash-aggregate
-- per viewer.
--
-- Re-created from the 0132 definition with identical output (same columns,
-- same joined/waiting/cluster_id semantics): the counts CTE now joins the
-- caller's own keys CTE, so it aggregates at most one group per matching mode
-- (6 indexed COUNTs) instead of the whole table.
--
-- No new index: queue_entries_ready_idx (mode, queue_key, joined_at) from 0003
-- already covers both the scoped counts and get_queue_count. The per-mode
-- joined EXISTS uses one_queue_per_mode (user_id, mode, queue_key).
--
-- Frontend note: the queue: broadcast channel had no sender (maybe_form_cluster
-- uses Postgres pg_notify, which never reaches Supabase Realtime Broadcast),
-- so the 15s poll was the only live path; it now polls at 60s with no
-- background refresh.

-- Live body is 0132 (which dropped 0018 per 0034's precedent); drop first so
-- any return-type change applies cleanly.
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
        when m.mode = 'open_mix'
          then public.fn_queue_key(m.mode, me.dob, me.country_code, me.local_area, me.local_radius_km)
        when m.mode <> 'local'
          then public.fn_queue_key(m.mode, me.dob, me.country_code, me.local_area, me.local_radius_km)
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

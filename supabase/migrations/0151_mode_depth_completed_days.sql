-- 0151 - Average queue depth over completed days only.
-- The queue-join trigger (0148) creates today's mode_daily_stats row with
-- queue_depth = 0 (column default), and the nightly rollup only ever fills
-- completed days. Including today in the 30-day depth average therefore bakes
-- in one systematic zero (~3% underestimate). Sums (formed, joins) correctly
-- keep today: joins are trigger-counted intraday events, not snapshots.
-- Signature unchanged, so create or replace keeps the 0148 grant.
create or replace function public.get_mode_breakdown()
returns table (
  mode public.matching_mode,
  clusters_formed int,
  queue_joins int,
  avg_queue_depth numeric,
  max_oldest_wait_hours numeric,
  active_clusters int,
  avg_messages_per_cluster numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_can_manage_roles();
  return query
  select m.mode,
    coalesce((select sum(s.clusters_formed)::int from public.mode_daily_stats s
      where s.mode = m.mode and s.day > (now() at time zone 'utc')::date - 30), 0),
    coalesce((select sum(s.queue_joins)::int from public.mode_daily_stats s
      where s.mode = m.mode and s.day > (now() at time zone 'utc')::date - 30), 0),
    coalesce((select avg(s.queue_depth) from public.mode_daily_stats s
      where s.mode = m.mode and s.day > (now() at time zone 'utc')::date - 30
        and s.day < (now() at time zone 'utc')::date), 0),
    coalesce((select max(s.oldest_wait_hours) from public.mode_daily_stats s
      where s.mode = m.mode and s.day > (now() at time zone 'utc')::date - 30), 0),
    (select count(*)::int from public.clusters c
      where c.matching_mode = m.mode and c.status = 'active'),
    coalesce((select avg(t.messages_30d) from (
      select sum(s.messages_day)::numeric as messages_30d
      from public.cluster_daily_stats s
      join public.clusters c on c.id = s.cluster_id
      where c.matching_mode = m.mode and c.status = 'active'
        and s.day > (now() at time zone 'utc')::date - 30
      group by s.cluster_id
    ) t), 0)
  from unnest(enum_range(null::public.matching_mode)) as m(mode)
  where m.mode <> 'birth_month'
  order by m.mode::text;
end; $$;

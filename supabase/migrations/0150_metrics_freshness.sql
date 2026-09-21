-- 0150 - Metrics freshness signals (data-through date + last rollup time).
-- The /admin/metrics header badge must state measured freshness, not the
-- cron promise: data_through_day is the newest snapshot day actually stored
-- (goes stale visibly if the rollup ever stops), and last_rollup_at is the
-- newest successful rollup-daily-metrics run (null before the first run).
-- Return-type change, so drop first per the 0034 precedent. Design record:
-- docs/archive/METRICS_TELEMETRY_PLAN.md.

drop function if exists public.get_metrics_overview();

create function public.get_metrics_overview()
returns table (
  total_clusters int,
  active_clusters int,
  daily_active_clusters int,
  messages_30d int,
  avg_clusters_per_user numeric,
  data_through_day date,
  last_rollup_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare v_last_rollup timestamptz;
begin
  perform public.assert_can_manage_roles();

  -- Last-success read follows get_admin_ops_health (0126); a missing cron
  -- schema or job history yields null, never a failure.
  begin
    select max(d.end_time) into v_last_rollup
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'rollup-daily-metrics' and d.status = 'succeeded';
  exception when others then
    v_last_rollup := null;
  end;

  return query
  select
    (select count(*)::int from public.clusters),
    (select count(*)::int from public.clusters where status = 'active'),
    (select count(*)::int from public.clusters c
      where c.status = 'active' and (
        exists (select 1 from public.messages m
          where m.cluster_id = c.id and m.created_at > now() - interval '24 hours')
        or exists (select 1 from public.calls ca
          where ca.cluster_id = c.id and ca.created_at > now() - interval '24 hours')
      )),
    (select count(*)::int from public.messages
      where created_at > now() - interval '30 days'),
    (select coalesce(
      (select count(*)::numeric from public.cluster_members cm
        join public.clusters c on c.id = cm.cluster_id
        where cm.left_at is null and c.status = 'active')
      / nullif((select count(distinct cm.user_id)::numeric from public.cluster_members cm
        join public.clusters c on c.id = cm.cluster_id
        where cm.left_at is null and c.status = 'active'), 0), 0)),
    (select max(s.day) from public.mode_daily_stats s),
    v_last_rollup;
end; $$;

grant execute on function public.get_metrics_overview() to authenticated;

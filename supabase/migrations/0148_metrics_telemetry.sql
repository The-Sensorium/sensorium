-- 0148 - Success-metrics telemetry (in-house, aggregates-only, admin-only).
-- Measures the PRD success metrics (retention, messages per cluster, daily
-- active clusters, clusters per user, mode popularity) with Postgres aggregate
-- tables + a nightly pg_cron rollup, read through admin-guarded RPCs on a new
-- /admin/metrics page. No vendor, no client SDK, no per-user event rows: the
-- snapshot tables have no user_id column by construction (asserted in
-- tests/integration/metrics.test.ts). Design record:
-- docs/archive/METRICS_TELEMETRY_PLAN.md.

-- -- 1) Snapshot tables (RLS enabled, no direct grants) -----------------------
-- Per-cluster daily aggregates. History source for trends + retention windows.
create table public.cluster_daily_stats (
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  day date not null,
  matching_mode public.matching_mode not null,
  active_members int not null default 0,
  messages_day int not null default 0,
  posts_day int not null default 0,
  calls_day int not null default 0,
  primary key (cluster_id, day)
);

-- Per-mode daily aggregates. queue_joins counts join EVENTS (rejoins count);
-- depth + oldest wait are point-in-time snapshots, not backfillable.
create table public.mode_daily_stats (
  mode public.matching_mode not null,
  day date not null,
  clusters_formed int not null default 0,
  queue_joins int not null default 0,
  queue_depth int not null default 0,
  oldest_wait_hours numeric not null default 0,
  primary key (mode, day)
);

alter table public.cluster_daily_stats enable row level security;
alter table public.mode_daily_stats enable row level security;

revoke all on table public.cluster_daily_stats from anon, authenticated;
revoke all on table public.mode_daily_stats from anon, authenticated;
grant select, insert, update, delete on table public.cluster_daily_stats to service_role;
grant select, insert, update, delete on table public.mode_daily_stats to service_role;

-- -- 2) Queue-join counter ----------------------------------------------------
-- Queue rows are deleted at formation, so joins cannot be counted post-hoc.
-- This trigger counts them at insert time into today's aggregate row.
-- History before this deploy is zero (documented on the dashboard, not faked).
create function public.count_queue_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.mode_daily_stats (mode, day, queue_joins)
  values (NEW.mode, (now() at time zone 'utc')::date, 1)
  on conflict (mode, day)
  do update set queue_joins = public.mode_daily_stats.queue_joins + 1;
  return NEW;
end; $$;

create trigger queue_join_counter
  after insert on public.queue_entries
  for each row execute function public.count_queue_join();

-- -- 3) Nightly rollup (idempotent) + schedule + purge ------------------------
create function public.rollup_daily_metrics(p_day date default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  -- Completed days only (default = yesterday UTC); the parameter exists for
  -- tests and the history backfill below.
  v_day date := coalesce(p_day, (now() at time zone 'utc')::date - 1);
begin
  insert into public.cluster_daily_stats
    (cluster_id, day, matching_mode, active_members, messages_day, posts_day, calls_day)
  select c.id, v_day, c.matching_mode,
    (select count(*) from public.cluster_members cm
      where cm.cluster_id = c.id and cm.left_at is null),
    (select count(*) from public.messages m
      where m.cluster_id = c.id and m.created_at >= v_day and m.created_at < v_day + 1),
    (select count(*) from public.posts p
      where p.cluster_id = c.id and p.created_at >= v_day and p.created_at < v_day + 1),
    (select count(*) from public.calls ca
      where ca.cluster_id = c.id and ca.created_at >= v_day and ca.created_at < v_day + 1)
  from public.clusters c
  where c.status <> 'archived'
  on conflict (cluster_id, day) do update set
    matching_mode = excluded.matching_mode,
    active_members = excluded.active_members,
    messages_day = excluded.messages_day,
    posts_day = excluded.posts_day,
    calls_day = excluded.calls_day;

  insert into public.mode_daily_stats (mode, day, clusters_formed, queue_depth, oldest_wait_hours)
  select m.mode, v_day,
    (select count(*) from public.clusters c
      where c.matching_mode = m.mode and c.created_at >= v_day and c.created_at < v_day + 1),
    (select count(*) from public.queue_entries q where q.mode = m.mode),
    coalesce((select extract(epoch from (now() - min(q.joined_at))) / 3600
      from public.queue_entries q where q.mode = m.mode), 0)
  from unnest(enum_range(null::public.matching_mode)) as m(mode)
  on conflict (mode, day) do update set
    clusters_formed = excluded.clusters_formed,
    queue_depth = excluded.queue_depth,
    oldest_wait_hours = excluded.oldest_wait_hours;
  -- NOTE: queue_joins is trigger-owned (§2) and intentionally untouched here.

  -- Retention parity with moderation records: drop snapshots older than 24 months.
  delete from public.cluster_daily_stats where day < v_day - interval '24 months';
  delete from public.mode_daily_stats where day < v_day - interval '24 months';
end; $$;

-- Idempotent (0039 pattern): unschedule by name, then re-declare.
select cron.unschedule('rollup-daily-metrics')
where exists (select 1 from cron.job where jobname = 'rollup-daily-metrics');
select cron.schedule('rollup-daily-metrics', '0 3 * * *', $$select public.rollup_daily_metrics()$$);

-- History backfill: formations/messages/posts/calls derive from created_at, so
-- past days backfill accurately. Queue depth/oldest-wait are point-in-time and
-- start at deploy values; queue joins start at zero (§2). No-op on empty DBs.
do $$
declare d date;
begin
  select min(c.created_at)::date into d from public.clusters c;
  if d is null then return; end if;
  while d < (now() at time zone 'utc')::date loop
    perform public.rollup_daily_metrics(d);
    d := d + 1;
  end loop;
end; $$;

-- -- 4) Admin read RPCs (security definer, admin-guarded) ---------------------
-- Guard pattern follows the staff RPCs (e.g. get_admin_ops_health in 0126):
-- granted to authenticated, enforced inside via assert_can_manage_roles().

create function public.get_metrics_overview()
returns table (
  total_clusters int,
  active_clusters int,
  daily_active_clusters int,
  messages_30d int,
  avg_clusters_per_user numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_can_manage_roles();
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
        where cm.left_at is null and c.status = 'active'), 0), 0));
end; $$;

-- Retention cohorts. Retained = still active AND >= 6 active members AND
-- >= 1 message in the trailing 30 days ("alive"). Thresholds are commented
-- constants on purpose: tune via a later migration, with history intact.
-- The 90d cohort is the PRD primary metric; 7d/30d are cold-start proxies.
create function public.get_retention()
returns table (cohort_days int, formed int, retained int, rate numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_can_manage_roles();
  return query
  with cohorts(cohort_days) as (values (7), (30), (90)),
  formed as (
    select ch.cohort_days, c.id
    from cohorts ch
    join public.clusters c on c.created_at <= now() - (ch.cohort_days || ' days')::interval
  )
  select f.cohort_days,
    count(*)::int,
    count(*) filter (where c.status = 'active'
      and (select count(*) from public.cluster_members cm
        where cm.cluster_id = c.id and cm.left_at is null) >= 6
      and exists (select 1 from public.messages m
        where m.cluster_id = c.id and m.created_at > now() - interval '30 days')
    )::int,
    coalesce(
      (count(*) filter (where c.status = 'active'
        and (select count(*) from public.cluster_members cm
          where cm.cluster_id = c.id and cm.left_at is null) >= 6
        and exists (select 1 from public.messages m
          where m.cluster_id = c.id and m.created_at > now() - interval '30 days')
      ))::numeric / nullif(count(*), 0)::numeric, 0)
  from formed f
  join public.clusters c on c.id = f.id
  group by f.cohort_days
  order by f.cohort_days;
end; $$;

-- Mode breakdown over the trailing 30 days (+ today). The retired birth_month
-- value stays in the enum type (0147) but is excluded here so the dashboard
-- shows only live modes; its snapshot rows remain for history.
create function public.get_mode_breakdown()
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
      where s.mode = m.mode and s.day > (now() at time zone 'utc')::date - 30), 0),
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

-- Cluster activity table for spotting dying clusters (admin-only; same
-- precedent as staff RPCs reading member-closed data via security definer).
create function public.get_cluster_activity(p_limit int default 50)
returns table (
  cluster_id uuid,
  name text,
  mode public.matching_mode,
  active_members int,
  messages_30d int,
  last_message_day date
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_can_manage_roles();
  return query
  select c.id, c.name, c.matching_mode,
    (select count(*)::int from public.cluster_members cm
      where cm.cluster_id = c.id and cm.left_at is null),
    (select count(*)::int from public.messages m
      where m.cluster_id = c.id and m.created_at > now() - interval '30 days'),
    (select max(m.created_at)::date from public.messages m
      where m.cluster_id = c.id)
  from public.clusters c
  where c.status = 'active'
  order by 5 desc
  limit greatest(p_limit, 1);
end; $$;

grant execute on function
  public.get_metrics_overview(),
  public.get_retention(),
  public.get_mode_breakdown(),
  public.get_cluster_activity(int)
  to authenticated;

revoke execute on function
  public.rollup_daily_metrics(date),
  public.count_queue_join()
  from public, anon, authenticated;

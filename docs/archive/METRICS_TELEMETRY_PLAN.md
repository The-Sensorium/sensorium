# Success-Metrics Telemetry — Implementation Plan

**Status:** Draft (not started)
**Goal:** Measure the PRD success metrics (`docs/PRD.md:522`) plus mode popularity, in-house in Postgres, surfaced on an admin-only dashboard. No third-party vendor, no per-user event rows, no client instrumentation.
**Non-goals:** Third-party product analytics (PostHug/Mixpanel/Plausible), client-side event SDKs, realtime dashboards, public stats pages, per-user funnels, mobile work (admin surfaces are web-only).

Locked user answers driving this plan: in-house Postgres; PRD set + mode popularity; admins only; daily batch; aggregates only.

---

## 1. Product decisions (locked)

| Decision | Value | Rationale |
|---|---|---|
| Collection | Postgres aggregate tables + `pg_cron` nightly rollup | No vendor, no data leaves the DB, matches existing cron/RPC patterns (`0039`, `0071`, `0126`). |
| Scope | PRD primary + secondary + mode popularity | Retention 90d, messages per cluster, daily active clusters, avg clusters per user, mode breakdown (formed / joins / depth / oldest wait). Exactly what the PRD names, nothing more. |
| Audience | Admins only, new `/admin/metrics` page | Existing `RequireSessionRole admin` guard + staff workspace; zero new access primitives. |
| Freshness | Daily batch (03:00 UTC), page `staleTime` 12h | Retention and mode-investment decisions don't need intraday data. |
| Privacy | Aggregate rows only; **no `user_id` column anywhere** | Counts and buckets (per-cluster, per-mode, per-day). Simplest retention story; asserted by test (§5.3). |
| Snapshot retention | Purge rows older than 24 months in the same rollup | Parity with the moderation 24-month rule (`docs/PRD.md:443`). |
| Charts | Tables + CSS bars with existing Tailwind tokens | No chart library is installed (verified); a new dependency is unjustified for 4 sections. |
| E2E | Deferred, not in v1 | No admin demo account exists; golden-path accounts are members. Covered by integration + unit instead. |

### 1.1 Metric definitions (exact — these are the contract)

All thresholds live as commented constants in the rollup/RPC bodies so a future tune is a migration, not a debate:

- **Retention (primary).** Per cohort (7d / 30d / 90d by `clusters.created_at`): of clusters formed ≥ N days ago, % **retained**, where retained = `status = 'active'` AND active members ≥ 6 AND ≥ 1 message in the trailing 30 days ("alive"). The 90d cohort is the PRD metric; 7d/30d are cold-start proxies until 90 days of history exist.
- **Messages per cluster (secondary).** Trailing-30d message count per active cluster: total + mean + per-mode mean. From `cluster_daily_stats`, not a live rescan.
- **Daily active clusters (secondary).** Clusters with ≥ 1 message OR ≥ 1 call in the trailing 24h. Computed **live** in the RPC (24h index scan), not snapshotted.
- **Avg active clusters per user.** Distinct active memberships ÷ distinct active members, live from `cluster_members` + `clusters`.
- **Mode popularity (per mode, trailing-30d window + today).** Clusters formed, queue join events, mean queue depth, max oldest-waiter age. Joins = events, not unique users (rejoins count; documented in UI copy).
- **Thin-pool signal (free bonus).** `oldest_wait_hours` per mode per day doubles as the wait/broaden input the PRD says is missing — observation before intervention.

### 1.2 Explicitly out of scope

- Per-user funnels, session tracking, client SDKs, pageview analytics beyond the existing `<Analytics/>`.
- Queue **wait-time-to-formation** averages: uncomputable post-hoc (queue rows are deleted at formation). `oldest_wait_hours` covers the need. Revisit only with a formation-time recorder.
- Public stats, moderator-visible metrics, email digests of metrics.
- Backfilling queue-join history (rows are gone; joins start counting at deploy — documented, not fixed).

---

## 2. Current-state map (files that must change)

### 2.1 Backend (Supabase / Postgres)

| File | What / why |
|---|---|
| `supabase/migrations/0148_metrics_telemetry.sql` (new) | The backend: 2 tables + RLS + join-count trigger + `rollup_daily_metrics()` + `pg_cron` schedule + 4 admin RPCs + grants + history backfill. No cross-transaction dependency (unlike enum additions). |
| `supabase/migrations/0149_metrics_service_role_grant.sql` (new) | Service-role execute on the rollup for manual backfill/refill (0148 revokes it from everyone; never edit an applied migration, so this ships separately). |
| `supabase/migrations/0150_metrics_freshness.sql` (new) | `get_metrics_overview` additionally returns `data_through_day` (newest stored snapshot day) + `last_rollup_at` (newest successful rollup run, null before the first). Return-type change, so the function is dropped first per the 0034 precedent. Powers the header badge's measured freshness. |
| `supabase/migrations/0151_mode_depth_completed_days.sql` (new) | `get_mode_breakdown` averages depth over completed days only (the trigger-owned today row always reads 0). Signature unchanged, so `create or replace` keeps the 0148 grant. |
| `supabase/migrations/0152_cluster_activity_limit.sql` (new) | `get_cluster_activity` capped at 500 rows (defense in depth; the UI pages 50-500). Signature unchanged, grant preserved. |
| `supabase/migrations/0142_open_cluster_at_formation.sql:25` | Read-only reference: `maybe_form_cluster` is **not** modified (formation counts derive from `clusters.created_at`). |
| `supabase/migrations/0003_queues_clusters.sql` | Read-only reference: `queue_entries(user_id, mode, queue_key, created_at)` is the trigger source; `clusters(created_at, matching_mode, status)` is the backfill source. |
| `supabase/migrations/0062_expired_suspension_and_role_guards.sql:120`, `0071:58`, `0126:103` | Cron-schedule precedent (`pg_cron.schedule`, idempotent bodies per `0039`). |
| `supabase/migrations/0052_platform_access_primitives.sql` | Read-only reference: `has_platform_role(uid, 'admin')` is the in-function admin guard (same as staff RPCs). |

### 2.2 Frontend (web only — no mobile changes)

| File | Change |
|---|---|
| `src/features/metrics.ts` (new) | 4 TanStack hooks (`useMetricsOverview`, `useRetention`, `useModeBreakdown`, `useClusterActivity`), `staleTime` 12h, no realtime subscriptions. Components never call Supabase directly. |
| `src/features/metrics.test.ts(x)` (new, colocated) | Hook tests following the existing `features/*.test.tsx` mock pattern. |
| `src/pages/staff/MetricsPage.tsx` (new) | 4 sections (§4.2). Lazy-loaded like the other staff pages. |
| `src/pages/staff/MetricsPage.test.tsx` (new, colocated) | Render tests with mocked hook data (loading / populated / error states). |
| `src/app/router.tsx:52-60,227-235` | Lazy import + `<Route path="/admin/metrics">` inside the existing `RequireSessionRole admin` block. No guard changes. |
| `src/pages/staff/StaffDashboardPage.tsx` | Link card into `/admin/metrics` (check how existing sections link first; one link, no redesign). |

### 2.3 Seed / tests / e2e

| File | Change |
|---|---|
| `tests/integration/metrics.test.ts` (new) | Rollup correctness, idempotency, access control, backfill, join trigger, no-`user_id`-column assertion (§5.3). |
| `scripts/seed-demo.mjs` | No change (metrics derive from whatever data exists; seed already provides 15 clusters). |
| `e2e/` | No change in v1 (§1, E2E deferred). |

### 2.4 Docs (source of truth — update in the same PR)

- `docs/TECHNICAL.md` migration-range section: `0148–0152` entry (telemetry schema + rollup + admin RPCs + freshness signals + depth/limit fixes).
- `docs/PRD.md:522` success-metrics section: annotate each metric with its dashboard source (`/admin/metrics`, section name). Do not rename metrics.
- `docs/archive/README.md` table — add this plan after ship.
- `README.md`, `mobile/README.md`, `docs/ARCHITECTURE.md`: no change (no new surface outside the existing admin workspace).

---

## 3. Backend implementation (`0148_metrics_telemetry.sql`)

### 3.1 Tables (RLS enabled, no direct grants)

```sql
-- Per-cluster daily aggregates. No user_id by construction (privacy decision §1).
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

-- Per-mode daily aggregates. joins = join EVENTS (rejoins count).
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
-- No policies and no grants to anon/authenticated: readable only inside
-- security-definer admin RPCs (§3.4), writable only by the rollup/trigger.
-- (Service role bypasses RLS for ops, same as rate_limit_events in 0138.)
```

`active_members` counts `cluster_members` with `left_at is null`. `messages_day` counts `messages` by `created_at::date` (all messages, including moderation-hidden ones — document: activity metric, not content review). `posts_day` counts `posts`; `calls_day` counts `calls` started that day.

### 3.2 Queue-join trigger (the only write-path addition)

Queue rows are deleted at formation, so joins can't be counted post-hoc. A trigger counts them at insert time into today's aggregate row:

```sql
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
```

Cost: one indexed PK upsert per join on an already rate-limited hot path (20/hour/user). History before deploy is zero — documented in the dashboard copy ("join counts start <deploy date>"), not backfilled.

### 3.3 Nightly rollup + schedule + purge (idempotent)

```sql
create function public.rollup_daily_metrics(p_day date default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_day date := coalesce(p_day, (now() at time zone 'utc')::date - 1);
begin
  -- Completed days only (default = yesterday UTC); parameter kept for tests/backfill.
  -- Per-cluster snapshot (all non-archived clusters; archived contribute history already stored).
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

  -- Per-mode snapshot: formations from clusters.created_at (backfillable);
  -- depth + oldest wait from live queue_entries (point-in-time by nature).
  insert into public.mode_daily_stats (mode, day, clusters_formed, queue_depth, oldest_wait_hours)
  select m.mode, v_day,
    (select count(*) from public.clusters c
      where c.matching_mode = m.mode and c.created_at >= v_day and c.created_at < v_day + 1),
    (select count(*) from public.queue_entries q where q.mode = m.mode),
    coalesce((select extract(epoch from (now() - min(q.created_at))) / 3600
      from public.queue_entries q where q.mode = m.mode), 0)
  from unnest(enum_range(null::public.matching_mode)) as m(mode)
  on conflict (mode, day) do update set
    clusters_formed = excluded.clusters_formed,
    queue_depth = excluded.queue_depth,
    oldest_wait_hours = excluded.oldest_wait_hours;
  -- NOTE: queue_joins intentionally untouched here (trigger-owned, §3.2).

  -- Retention parity with moderation records: drop snapshots older than 24 months.
  delete from public.cluster_daily_stats where day < v_day - interval '24 months';
  delete from public.mode_daily_stats where day < v_day - interval '24 months';
end; $$;

-- Schedule precedent: 0071/0126 pg_cron jobs. Unschedule-if-exists first per 0039.
select cron.unschedule('rollup-daily-metrics') where exists
  (select 1 from cron.job where jobname = 'rollup-daily-metrics');
select cron.schedule('rollup-daily-metrics', '0 3 * * *', $$select public.rollup_daily_metrics();$$);
```

Backfill (same migration, after the function): loop `rollup_daily_metrics(d)` over each date from the earliest `clusters.created_at` to yesterday. Formations/messages/posts/calls backfill from history; queue depth/oldest-wait start at deploy values (point-in-time — document, don't fake). Guard the loop for empty DBs (fresh `db reset` with no clusters = no-op).

### 3.4 Admin read RPCs (security definer, admin-guarded, granted to authenticated)

Pattern follows staff RPCs: `if not public.has_platform_role(auth.uid(), 'admin') then raise exception 'not_authorized'; end if;` as the first statement. `grant execute ... to authenticated;` (anon gets nothing; RLS on base tables stays closed).

```sql
-- Overview cards: totals + daily-active-clusters (live 24h scan) + trailing-30d messages.
create function public.get_metrics_overview() returns table (
  total_clusters int, active_clusters int, daily_active_clusters int,
  messages_30d int, avg_clusters_per_user numeric
) ...

-- Retention cohorts: for N in (7, 30, 90): {cohort, formed, retained, rate}.
-- retained = status active AND active_members >= 6 AND >= 1 message trailing 30d.
-- Thresholds as commented constants; tune via future migration, not ad hoc.
create function public.get_retention() returns table (
  cohort_days int, formed int, retained int, rate numeric
) ...

-- Mode breakdown, trailing-30d window (+ today row): formed, joins, avg depth,
-- max oldest-wait, active clusters, avg messages per active cluster.
create function public.get_mode_breakdown() returns table (
  mode public.matching_mode, clusters_formed int, queue_joins int,
  avg_queue_depth numeric, max_oldest_wait_hours numeric,
  active_clusters int, avg_messages_per_cluster numeric
) ...

-- Cluster activity table (admin-only; mirrors staff-RPC precedent for
-- member-closed data): name, mode, active members, trailing-30d messages,
-- last-message day. Ordered by messages desc; limit param, default 50.
create function public.get_cluster_activity(p_limit int default 50) returns table (
  cluster_id uuid, name text, mode public.matching_mode,
  active_members int, messages_30d int, last_message_day date
) ...
```

`avg_clusters_per_user` = active memberships ÷ distinct active members (live). All four functions `stable`, `security definer`, `set search_path = public`.

### 3.5 Realtime / cron / storage

No changes. No realtime publications (daily batch needs none); no new buckets; cron addition only (§3.3).

---

## 4. Frontend implementation (web only)

### 4.1 `src/features/metrics.ts` (new)

```ts
// Four hooks wrapping the §3.4 RPCs via TanStack Query.
// staleTime 12h (daily batch), no realtime subscriptions, no polling.
export function useMetricsOverview() { ... }
export function useRetention() { ... }
export function useModeBreakdown() { ... }
export function useClusterActivity(limit?: number) { ... }
```

Error mapping: `not_authorized` → the staff "no access" treatment used by other admin pages (check `StaffDashboardPage`/role guards first; reuse, don't invent).

### 4.2 `src/pages/staff/MetricsPage.tsx` (new, lazy route `/admin/metrics`)

Four sections, tables + CSS bars (existing tokens only — no chart dependency):

1. **Overview cards**: total / active / daily-active clusters, trailing-30d messages, avg clusters per user.
2. **Retention**: 7d / 30d / 90d cohort table (formed, retained, rate bar). Footnote: 90d fills in 90 days post-launch; 7d/30d are interim proxies. Footnote: join counts start at deploy (§3.2).
3. **Mode breakdown**: per-mode table (formed, joins, avg depth, max oldest-wait, active, avg messages) + depth trend bars from daily rows. Copy: "joins = join events; rejoins count."
4. **Cluster activity**: admin table (name, mode, members, 30d messages, last-message day) for spotting dying clusters.

`src/app/router.tsx`: lazy import + route inside the existing `RequireSessionRole admin` block (no guard changes). `StaffDashboardPage.tsx`: one link card to `/admin/metrics`.

---

## 5. Seed, tests, and docs updates

### 5.1 `scripts/seed-demo.mjs`

No change. Metrics derive from existing data; the 15 seeded clusters exercise every section on day one.

### 5.2 Unit tests (Vitest, colocated — coverage gate unchanged)

- `src/features/metrics.test.ts(x)`: hook success/error shapes following the existing `features/*.test.tsx` mock pattern; `not_authorized` mapping.
- `src/pages/staff/MetricsPage.test.tsx`: loading / populated / error renders with mocked hooks; retention footnotes present; tables render per-mode rows.
- Gate (`vite.config.ts`: lines 34%, functions 33%, branches 20%) must still pass via `npm run test:coverage`. Never lower thresholds.

### 5.3 Integration tests (`tests/integration/metrics.test.ts`, requires `supabase start`)

1. Rollup correctness: fixture clusters/messages/posts/calls/queues → run `rollup_daily_metrics(today-1)` → assert exact snapshot rows (counts, modes, depths, oldest-wait).
2. Idempotency: run twice → no duplicate rows, same values.
3. Parameterized day: rollup for an arbitrary past date writes that date's row.
4. Access control: anon denied, plain member denied (`not_authorized` on all 4 RPCs), admin allowed.
5. Backfill: pre-existing clusters/messages appear in formed/message counts after a historical rollup; queue joins start at zero.
6. Join trigger: `join_queue` increments today's `queue_joins`; `leave_queue` does not decrement (events, documented).
7. Privacy assertion: `cluster_daily_stats` and `mode_daily_stats` have no `user_id` column (information_schema check) — locks the aggregates-only decision in code.
8. Purge: rows older than 24 months removed by the rollup.

### 5.4 E2E

Deferred in v1 (§1): no admin demo account; golden-path accounts are members. Integration (§5.3.4) covers the security boundary; unit (§5.2) covers rendering. Follow-up (not this plan): seed an `admin@demo.example` + role and add an `/admin/metrics` spec.

### 5.5 Mobile acceptance

None. Admin surfaces are web-only per `AGENTS.md`; no `mobile/` file changes, so `sync-db-types --check` is unaffected (still run it pre-push per rule).

---

## 6. Execution order + verification

1. `0148` → `supabase db reset` → migration applies cleanly → `supabase db lint --local` clean (pre-existing warnings only).
2. Assert on fresh DB: snapshot tables exist with RLS enabled and zero policies/grants to anon/authenticated; trigger fires on a test `queue_entries` insert; `rollup_daily_metrics()` backfills seeded history; purge deletes a >24-month fixture row.
3. Web edits (§4) + unit tests; `npm run lint` clean.
4. `npm test <touched-files>` → `npm run test:coverage` (gate passes).
5. `npm run build` passes.
6. `npm run test:integration` (full suite) against local stack.
7. `npm run seed:demo` → grant yourself admin (service-role `user_roles` insert, same as integration helpers) → `/admin/metrics` renders all four sections with seeded data.
8. Docs updates (§2.4) in the same branch.
9. Pre-push per `AGENTS.md`: `lint` + `test:coverage` + `build`; migrations changed → `db reset` + `test:integration` done above; `sync-db-types --check` (no synced-file changes expected — metrics is new code, not a synced module).

Branch from `develop` as `feat/metrics`, PR into `develop` (squash). Never touch `main`. Staging verifies the dashboard against real beta data on merge; the 90d cohort fills over time.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| 90d retention empty for 3 months post-launch | 7d/30d proxy cohorts + dashboard footnote; the metric was unmeasurable before, proxies beat nothing. |
| Queue-join history starts at deploy | Footnoted on dashboard; depth/oldest-wait/formations are backfilled, so only one column ramps. |
| Trigger overhead on the join hot path | One indexed PK upsert per join; path already rate-limited (20/hour/user). Measured, not guessed — watch `join_queue` p99 if concerned. |
| Threshold arbitrariness (≥6 members, ≥1 message) | Commented constants in the RPC; tuning is a later migration with history intact. |
| Snapshot growth (clusters × days) | Trivial at beta scale; 24-month purge bounds it; revisit partitioning only with data. |
| Admin-only leak via new RPCs | Same guard pattern as staff RPCs; denied-path integration tests for anon + member on all four functions. |
| Cron silently stops | Same observability posture as existing jobs (no new infra); rollup is date-parameterized so gaps are manually refillable. |
| E2E gap (no admin golden-path user) | Explicitly deferred with a named follow-up (§5.4); security boundary covered by integration. |

---

## 8. Locked decisions (no open questions)

1. **In-house Postgres.** No vendor, no SDK, no data leaves the stack.
2. **PRD set + mode popularity.** Retention 90d (primary), messages/cluster + daily-active (secondary), clusters/user, mode breakdown. Nothing more in v1.
3. **Admins only.** `/admin/metrics` behind the existing session-role guard.
4. **Daily batch.** `pg_cron` 03:00 UTC, 12h page staleTime, no realtime.
5. **Aggregates only, no `user_id` columns.** Locked by information_schema test (§5.3.7).
6. **Migrations `0148–0152`.** `0148` carries the backend (no cross-transaction dependency; enum-split precedent doesn't apply); `0149` adds the service-role rollup grant, `0150` the overview freshness columns, `0151` the completed-days depth average, and `0152` the activity limit cap as separate files per the never-edit-applied-migrations rule.
7. **No mobile changes.** Admin is web-only; E2E deferred for lack of an admin demo account.

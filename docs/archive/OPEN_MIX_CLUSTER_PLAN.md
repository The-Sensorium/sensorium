# Open Mix Cluster — Implementation Plan

**Status:** Shipped (migrations `0131–0132`; six modes live, 7-day `open_mix` cooldown)
**Goal:** Add a 6th matching mode, `open_mix`, that forms the same permanent 8-person clusters as the existing 5 modes, but with no birth-date or location criteria — pure first-come, first-served in join order. Positioned as the onboarding bridge so new users get a cluster fast while waiting on thin birth-date queues.
**Non-goals:** Temporary/expiring clusters, DMs, changing cluster size (still exactly 8), changing the intro/chat/governance lifecycle.

---

## 1. Product decisions (locked for this plan)

| Decision | Value | Rationale |
|---|---|---|
| Mode value | `open_mix` | Snake-case like the rest; DB enum + TS union. |
| UI label | `Open Mix` | Avoids "Random" reading as low-effort. Copy: "First 8 in — no birth-date or location filter". |
| Queue key | Constant `'open'` | Single global pool. `maybe_form_cluster` already takes first 8 ordered by `joined_at`, so batches form FIFO with no new logic. |
| Mode label (`mode_label`) | `'Open Mix'` | Used for cluster naming (`'Open Mix Cluster'`) via `fn_mode_label`. |
| Lifecycle | Identical to other modes | Queue → 8/8 `maybe_form_cluster` → `introductions` (72h) → `active` → chat/signals/posts/votes/replacement. No new tables, statuses, or triggers. |
| Multi-membership | 1 active `open_mix` cluster at a time, independent of other modes | Already enforced by the existing `already_in_cluster_of_mode` guard in `join_queue`. A user can be in `open_mix` + birth modes simultaneously (up to 6 total). This is intentional: bridge, not replacement. |
| Queue constraint | `one_queue_per_mode` reused as-is | One `open_mix` queue entry per user, like every other mode. |
| Local-only rule does NOT apply | No location required | `join_queue` location gate stays `local`-only. `open_mix` needs only `dob is not null` (onboarding complete). |
| Cooldown | **7 days for `open_mix`, 30 days for the other 5** | Try-out mode needs a short leash. Voluntary leave, vote-removal, and moderation-enforcement paths all use the per-mode interval so copy stays consistent. |
| Replacement eligibility | Unchanged | `0014_replacement_functions.sql:21` already excludes users on cooldown; shorter interval automatically makes ex-`open_mix` members eligible sooner. Acceptable and intended. |
| Discovery/privacy | Same as other modes | Tiles show active-cluster count; mode page shows name/status/member-count/formation-date only. No queue-member or message exposure. |
| Onboarding | `open_mix` pre-selected by default; user can deselect, must still select at least one | Fastest win for cold-start; copy frames it as "Start here while you wait". |

### 1.1 Explicitly out of scope

- Weekly/daily buckets (`2026-W37`). A single `'open'` key is simpler and forms faster. Buckets can be added later without breaking the enum.
- Cap on total clusters per user (still an open PRD question). Not decided here.
- "Thin pool broaden" prompt (`docs/PRD.md:87`). Complementary, not replaced.
- Changing `CLUSTER_SIZE`.

---

## 2. Current-state map (files that must change)

### 2.1 Backend (Supabase / Postgres)

| File | What hardcodes the 5 modes / 30 days |
|---|---|
| `supabase/migrations/0001_enums.sql:3` | `matching_mode` enum definition (5 values). Immutable — new value comes via new migration, never an edit. |
| `supabase/migrations/0011_matching_functions.sql:3` | `fn_queue_key` (per-mode key derivation), `fn_mode_label` (`0011:20`), `maybe_form_cluster` (`0011:31`, generic — no change needed), `join_queue` (`0011:92`, `already_in_cluster_of_mode` + `local` location gate + `cooldown_active` check), `leave_queue`, `get_queue_count`, `get_my_queue_keys`. |
| `supabase/migrations/0020_fix_mode_label.sql:7` | Current `fn_mode_label` body (this is the live one — `0011`'s copy is superseded). Must handle `open_mix`. |
| `supabase/migrations/0018_get_my_matching_status.sql:24` | Enumerates modes via `enum_range(null::matching_mode)` (auto-picks up `open_mix`) but derives keys via `fn_queue_key` — returns `null` key/label until `fn_*` handle the new mode. |
| `supabase/migrations/0129_join_queue_radius_fallback.sql:28` | Live `join_queue` wrapper (radius fallback). Contains its own `cooldown_active` check — must stay consistent. Read it before writing the new migration. |
| Cooldown writers (all `now() + interval '30 days'`) | `0013_vote_functions.sql:98` (vote-removal), `0014_replacement_functions.sql:38` → superseded by `0026_departure_notice.sql:29` (`leave_cluster`), `0054_moderation_enforcement.sql:442`, `0065_clean_leave_notice_copy.sql:24`. All must branch per mode. |
| `supabase/migrations/0003_queues_clusters.sql:43` | `mode_cooldowns` table + `one_queue_per_mode` constraint. No schema change needed. |
| Grants | `0017_grants.sql`, `0113_public_table_grants.sql` — no new tables/functions needing grants except the cooldown helper (see §3). |

### 2.2 Frontend (web)

| File | Change |
|---|---|
| `src/lib/modes.ts:5` | Add `'open_mix'` to `MatchingMode`, add entry to `MATCHING_MODES` with label/detail/icon. Icon: `Shuffle` (lucide-react) — distinct from Cake/Calendar/MapPin set. |
| `src/lib/modes.test.ts:5` | Update "exactly five" assertion to six + cover `open_mix` label/detail. |
| `src/lib/error.ts:27` | `joinQueueErrorMessage` hardcodes "30-day cooldown". Must become per-mode (accept optional `mode`, or generic "A cooldown is active…" + leave duration to the mode page). |
| `src/pages/cluster/SettingsView.tsx:92` | "30-day cooldown" leave copy → per-mode (`7-day` for `open_mix`). Needs cluster's `matching_mode` (already available via `useMyClusters`/cluster query). |
| `src/pages/onboarding/step-modes.tsx:31` | Renders from `MATCHING_MODES` — automatic. Update helper copy at `:69` ("life stages and place") to mention the no-filter option. |
| `src/pages/ClustersPage.tsx:53` | Renders tiles from `MATCHING_MODES` + `usePublicClusterCounts` — automatic. No logic change. |
| `src/pages/DiscoveryModePage.tsx:10` | `isMatchingMode`/`modeInfo` gate — automatic once `modes.ts` updated. |
| `src/pages/discovery/ModePanel.tsx:82` | `JoinCard` displays raw `queueKey` as heading (`'open'` would look broken). Needs display override for `open_mix` (e.g. "Open pool" + "First 8 in form a cluster"). `JoinedCard` same. `LocalSetupCard` untouched. |
| `src/features/matching.ts` | No logic change (RPC names unchanged). Verify `useJoinQueue` passes no `radiusKm` for `open_mix` (same as birth modes). |
| `src/lib/database.types.ts:2895` | Generated. Regen after migration; do not hand-edit except to unblock. |
| `src/components/ClusterCard.tsx:19`, `ClusterLayout.tsx:77` | `modeInfo(...)` — automatic, but will throw for unknown mode until `modes.ts` updated. Covered by modes test. |

### 2.3 Seed / tests / e2e (web)

| File | Change |
|---|---|
| `scripts/seed-demo.mjs:79` | Add one `open_mix` demo cluster (e.g. `Harbor` / `modeLabel 'Open Mix'` / `queueKey 'open'`) so Discovery/E2E show the mode non-empty. Keep `Aurora` untouched (E2E depends on it). |
| `tests/integration/matching.test.ts` | Add: join returns `queue_key 'open'`; 8 randos with different DOBs form one cluster; `get_my_matching_status` includes `open_mix`; cooldown writer produces ~7d for `open_mix` / ~30d for others. |
| `tests/integration/governance.test.ts:162` | Cooldown assertions — extend with per-mode durations. |
| `e2e/golden-path.spec.ts:28` | Add tile→`/discovery/open_mix` navigation assertion (mirror of `exact_birthdate`). |
| `src/pages/onboarding/OnboardingPage.test.tsx` | Mocks `step-modes`; no change unless copy asserted. |

### 2.4 Mobile (`mobile/` — mirrors web, do not hand-edit generated copies)

| File | Change |
|---|---|
| `mobile/src/lib/modes.ts:5` | Same 6th entry (icon from `lucide-react-native`, `Shuffle` equivalent). |
| `mobile/src/lib/database.types.ts:2895` | Via `cd mobile && npm run sync:db-types`. |
| `mobile/src/components/onboarding/StepModes.tsx:3`, `mobile/app/(app)/clusters.tsx:6`, `mobile/app/(app)/mode/[modeId].tsx:14`, `mobile/app/(app)/cluster/[clusterId]/settings.tsx:90`, `mobile/src/lib/error.ts:29` | Same per-mode copy/icon handling as web. `mobile/src/features/realtime.ts` is pinned — reconcile by hand, do not overwrite. See `mobile/README.md`. |

### 2.5 Docs (source of truth — update in the same PR)

- `docs/PRD.md:66` modes table + `:145` Cluster Joining list + `:651` Cluster Types + `:809` onboarding toggles + `:360` Cooldown Rules (add per-mode table) + `:543` success metrics (mode breakdown now has 6).
- `docs/ARCHITECTURE.md:78` "up to five matching modes" → six.
- `docs/TECHNICAL.md:87` feature table note + migration-range section (new `0131–0132` entries).
- `README.md:38` matching bullet ("five queues" → six).
- `mobile/README.md` if it enumerates modes.
- `docs/archive/README.md` table — add this plan's follow-up record after ship (plans live in `archive/` once shipped).

---

## 3. Backend implementation (migrations)

**Numbering:** next free is `0131` (`0130_push_token_single_owner.sql` is current head). Use **two** migrations because `ALTER TYPE … ADD VALUE` cannot safely share a transaction with functions that consume the new label:

- `0131_open_mix_enum.sql` — enum only.
- `0132_open_mix_queue_cooldown.sql` — helper + function rewrites.

Both must pass `supabase db lint --local`.

### 3.1 `0131_open_mix_enum.sql`

```sql
-- 0131 - Open Mix matching mode (enum only; kept separate so the new label
-- is committed before any function body references it).
alter type public.matching_mode add value if not exists 'open_mix';
```

No grants/RLS change. Verify with `select enum_range(null::public.matching_mode);`.

### 3.2 `0132_open_mix_queue_cooldown.sql`

**3.2.1 Cooldown helper (new, single source of truth):**

```sql
create or replace function public.fn_cooldown_interval(p_mode public.matching_mode)
returns interval
language sql immutable as $$
  select case p_mode when 'open_mix' then interval '7 days' else interval '30 days' end;
$$;
```

Grant: `grant execute on function public.fn_cooldown_interval(public.matching_mode) to authenticated;` only if any client calls it directly (they don't — but harmless and consistent with `get_my_matching_status` grants). At minimum the `postgres`/cron roles already resolve it inside `security definer` functions.

**3.2.2 `fn_queue_key` — add branch:**

```sql
when 'open_mix' then 'open'
```

Full `case` becomes: `exact_birthdate` → `YYYY-MM-DD`, `birth_year_month` → `YYYY-MM`, `birth_month` → `MM`, `birth_year` → `YYYY`, `local` → `COUNTRY:area:radius`, `open_mix` → `'open'`. Ignores dob/country/area/radius inputs (still required args for signature stability).

**3.2.3 `fn_mode_label` (rewrite the live body from `0020`) — add branch:**

```sql
when 'open_mix' then 'Open Mix'
```

Keep all other branches byte-identical.

**3.2.4 `join_queue` — verify against `0129` live body, then:**

- Keep `dob is null → 'complete onboarding first'`.
- Keep `mode_cooldowns … available_at > now() → 'cooldown_active'` (duration logic lives in writers, not here).
- Keep `already_in_cluster_of_mode` (gives 1-active-`open_mix` rule for free).
- Keep `local`-only location gate; add explicit guard so a stray `p_radius_km` with `open_mix` is ignored, not errored.
- `v_key := fn_queue_key(...)` now yields `'open'`; insert path unchanged (`one_queue_per_mode` conflict → no-op).

**3.2.5 Cooldown writers — replace `now() + interval '30 days'` with `now() + public.fn_cooldown_interval(<mode>)`:**

1. `leave_cluster` (live body in `0026`) — `v_mode` variable already exists.
2. Vote-removal path (`0013_vote_functions.sql:98`, `v_mode` in scope).
3. Moderation enforcement (`0054_moderation_enforcement.sql:442`, check variable name — likely `v_mode`/`p_mode`).
4. Clean-leave notice copy (`0065_clean_leave_notice_copy.sql:24`).
5. Any later override discovered via `grep "30 days" supabase/migrations`.

Each is a `create or replace function …` copying the current body verbatim except the interval expression. Do not otherwise refactor.

**3.2.6 `get_my_matching_status` (`0018`)** — the `keys` CTE has a `local`-vs-rest `case`. Add explicit `when m.mode = 'open_mix' then public.fn_queue_key(m.mode, me.dob, …)` (same call; clarity over cleverness) so the intent is visible and `queue_key`/`label` are never null for the new mode.

**3.2.7 `maybe_form_cluster`, `get_queue_count`, `get_my_queue_keys`, `leave_queue`, triggers** — no change (fully generic over `(mode, queue_key)`).

### 3.3 Realtime / cron / storage

No changes. Queue-count broadcast (`queue:open_mix:open` channel via existing `useQueueCount`), `pg_notify('queue_update', …)`, intro-deadline cron, and bucket policies are all mode-agnostic.

---

## 4. Frontend implementation (web)

### 4.1 `src/lib/modes.ts`

```ts
import { Cake, Calendar, CalendarCheck, CalendarDays, MapPin, Shuffle } from 'lucide-react'
export type MatchingMode =
  | 'exact_birthdate' | 'birth_year_month' | 'birth_month' | 'birth_year' | 'local'
  | 'open_mix'
{ value: 'open_mix', label: 'Open Mix', detail: 'First 8 in, no birth-date or location filter', icon: Shuffle },
```

Place `open_mix` **last** (after `local`) so existing tile order/snapshots don't shift. `modeInfo`/`isMatchingMode` need no logic change.

### 4.2 Per-mode cooldown copy

- `src/lib/error.ts` — change signature to `joinQueueErrorMessage(error, mode?: MatchingMode)`; cooldown branch returns `…7-day cooldown…` for `open_mix`, `…30-day…` otherwise. Callers in `ModePanel` pass `mode`. Keep fallback when mode unknown.
- `src/pages/cluster/SettingsView.tsx:91` — replace static paragraph with `{cooldownDays === 7 ? '7-day' : '30-day'}` derived from `cluster.matching_mode === 'open_mix'`. Same for `mobile/.../settings.tsx:90`.
- Consider a tiny helper `cooldownDaysForMode(mode)` in `src/lib/modes.ts` (and mobile mirror) returning `7 | 30`, unit-tested, to avoid triplicating the ternary. Single source for copy; DB remains source for enforcement.

### 4.3 `ModePanel` display override

`queueKey` for `open_mix` is the bare string `'open'`. Add:

```ts
const displayKey = mode === 'open_mix' ? 'Open pool' : queueKey
const displayBlurb = mode === 'open_mix'
  ? 'Join and you’ll be grouped with the next 7 people in line, whoever they are. Clusters are built to last.'
  : 'Join this queue and you’ll be grouped with 7 strangers sharing this match. Clusters are built to last.'
```

Apply in both `JoinCard` and `JoinedCard`. No change to `useQueueCount(mode, queueKey)` — it must keep receiving the raw `'open'` key.

### 4.4 Onboarding copy (`step-modes.tsx:69`) + default selection

> "Birth modes match around when and where you started out. Open Mix skips the filter and groups the next 8 people in line — the fastest way to start while you wait on a tighter match."

- `open_mix` is pre-selected in a fresh onboarding draft. User can toggle it off like any other mode.
- Keep "must select at least one" validation unchanged.

### 4.5 Generated types

After `supabase db reset` + migrations, regen `src/lib/database.types.ts` (no codegen script in `package.json` — use the project's usual `supabase gen types` flow), then `cd mobile && npm run sync:db-types`. Never hand-edit either file except to unblock a broken gen.

---

## 5. Seed, tests, and docs updates

### 5.1 `scripts/seed-demo.mjs`

Add to `CLUSTERS`, e.g.:

```js
{ name: 'Harbor', mode: 'open_mix', modeLabel: 'Open Mix', queueKey: 'open',
  status: 'active', formedDaysAgo: 12, members: [30, 31, 32, 33, 34, 35, 36, 37] },
```

Reuse `PEOPLE` indices not already overused; respect "nobody in two clusters of the same mode". Header comment (`matching state … all five matching modes`) → six.

### 5.2 Unit tests (Vitest, colocated)

- `src/lib/modes.test.ts` — six-value order assertion; `modeInfo('open_mix')` label/detail/icon; `isMatchingMode('open_mix') === true`; `cooldownDaysForMode` (if added) `7` vs `30`.
- `src/lib/error.test.ts:62` — cooldown message per mode.
- `SettingsView`/`ModePanel` tests if they assert copy — update to per-mode variants.
- Coverage gate (`vite.config.ts`: lines 34%, functions 33%, branches 20%) must still pass via `npm run test:coverage`. Never lower thresholds.

### 5.3 Integration tests (`tests/integration/`, requires `supabase start`)

Extend `matching.test.ts`:

1. `join_queue open_mix` returns `{ queue_key: 'open', waiting: 1 }` for users with different DOBs/countries and no location set.
2. 8 heterogeneous users → one `clusters` row (`matching_mode 'open_mix'`, `queue_key 'open'`, `status 'introductions'`), 8 `cluster_members`, 0 remaining `queue_entries`, 8 `cluster_formed` notifications.
3. 9th joiner stays queued (`waiting 1`).
4. `get_my_matching_status` row for `open_mix` has non-null `queue_key`/`label`, correct `joined`/`waiting`.
5. `leave_cluster` on an `open_mix` cluster writes `mode_cooldowns.available_at ≈ now()+7d`; same flow on `birth_year` writes ≈ `now()+30d`. Re-join blocked with `cooldown_active` inside window.
6. `already_in_cluster_of_mode` blocks a second `open_mix` cluster while active.

Extend `governance.test.ts` cooldown assertions with the 7/30 split (leave + vote-remove paths).

### 5.4 E2E (Playwright, requires `supabase start` + `npm run seed:demo` + chromium)

- `golden-path.spec.ts` — mirror tile test: `/clusters` → link `/discovery/open_mix` renders `ModePanel` join/queued state. No new `data-e2e` hooks unless needed (tests select by `data-e2e`).

### 5.5 Mobile acceptance

- Onboard → select Open Mix → queue → (with 8 test users) cluster forms → intro → room; leave copy shows 7-day; mode tile + directory render. Run `mobile` lint/typecheck per `mobile/README.md`.

---

## 6. Execution order + verification

1. `0131` migration → `supabase db reset` → confirm enum contains `open_mix`.
2. `0132` migration → `supabase db reset` → `supabase db lint --local` clean.
3. Regen `database.types.ts` → web + `sync:db-types` mobile.
4. Web edits (§4) + `modes.test.ts` / `error.test.ts` updates.
5. `npm run lint` clean (oxlint, fix by hand).
6. `npm test <touched-files>` → `npm run test:coverage` (gate passes).
7. `npm run build` (typecheck + vite) passes.
8. `npm run test:integration` against local stack (matching + governance).
9. `npm run seed:demo` → verify `/clusters` shows 6 tiles, `/discovery/open_mix` queue works, leave copy correct.
10. `npm run test:e2e` (chromium).
11. Docs updates (§2.5) in the same branch.
12. Pre-push (per `AGENTS.md`): `lint` + `test:coverage` + `build`; migrations changed → `db reset` + `test:integration` already done above.

Branch from `develop` as `feat/open-mix`, PR into `develop` (squash). Never touch `main`. Migrations apply to staging on merge, prod only via `develop` → `main` release (merge commit, after `npm run check:release`).

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `ALTER TYPE … ADD VALUE` in-transaction pitfalls | Split enum/function migrations (§3); `db reset` from scratch in CI. |
| `fn_mode_label`/`fn_queue_key` live bodies drifted (`0020`, `0129`) | Copy the *current* bodies verbatim; `grep "30 days"` + `grep fn_mode_label` to catch every override before writing `0132`. |
| Raw `'open'` key leaking into UI | Display override in `ModePanel` only; RPCs keep raw key. Covered by E2E. |
| `open_mix` cannibalizes birth queues | Position as bridge in copy; track mode-popularity + avg-clusters-per-user (`PRD` success metrics). Revisit if birth fills collapse. |
| Faster churn → replacement load | 7-day (not zero) cooldown preserves friction; replacement flow unchanged and already handles vacancies. |
| Stale mobile mirror | `sync:db-types` + hand-reconcile `realtime.ts`; mobile CI (`mobile.yml`) must pass. |
| Forgetting docs | PR checklist: PRD table, ARCHITECTURE "five→six", TECHNICAL ranges, README bullet, archive record post-ship. |

---

## 8. Locked decisions (no open questions)

1. **Onboarding pre-selects `open_mix`.** Fresh draft includes it; user can deselect. Still requires at least one mode and explicit "Join Queue(s)" confirmation.
2. **Default cluster name stays standard.** `fn_mode_label('open_mix','open') = 'Open Mix'` → `maybe_form_cluster` names it `'Open Mix Cluster'`, same pattern as other modes. No harbor/lighthouse naming in v1.
3. **Vote-removed `open_mix` members get 7 days.** Same interval as voluntary leave for copy simplicity and consistent `mode_cooldowns` behavior.
4. **Single global pool, no buckets.** `queue_key = 'open'` FIFO only. If long waiter tails appear later, revisit batching — not in v1.

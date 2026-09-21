# Generation Cluster — Implementation Plan

**Status:** Draft (not started)
**Goal:** Replace the `birth_month` matching mode with a new `generation` mode: static 0-anchored 5-year birth cohorts (e.g. `1995-1999`, `2000-2004`). Same permanent 8-person clusters, same lifecycle, no new PII, years-only labels.
**Non-goals:** Named generations (Millennial/Gen Z) as keys, rolling/personalized age windows, sex/sexuality/location filters, changing cluster size (still exactly 8), changing intro/chat/governance lifecycle.

Locked user answers driving this plan: 0-anchored bands; beta-only so all `birth_month` queues/clusters/cooldowns are deleted (no freeze/migrate); enum `generation`, UI label `Born 2000-2004`; no generation-nickname helper text.

---

## 1. Product decisions (locked)

| Decision | Value | Rationale |
|---|---|---|
| Mode value | `generation` | Snake-case like the rest; DB enum + TS union. Avoids `age_band` (implies shifting age) and `birth_5yr` (jargon). |
| UI label | `Born 2000-2004` (dynamic per cohort) | Years-only per user answer. Static birth range, never shifts with calendar year (unlike `Age 22-26`). |
| UI detail | `Born within the same 5 years` | No Gen Z / Millennial hint per user answer. Avoids contested US-centric labels. |
| Queue key | `2000-2004` (`start-end`, 0-anchored) | `start = floor(birth_year / 5) * 5`, `end = start + 4`. ~10 global queues, fills fast, tight life-stage. Deterministic exact-key so `maybe_form_cluster` works unchanged. |
| Mode label (`mode_label`) | `'Born 2000-2004'` | `maybe_form_cluster` names clusters `'Born 2000-2004 Cluster'`, same pattern as other modes. |
| Lifecycle | Identical to other modes | Queue → 8/8 `maybe_form_cluster` → open cluster → chat/signals/posts/votes/replacement. No new tables, statuses, triggers. |
| Multi-membership | 1 active `generation` cluster at a time, independent of other modes | Existing `already_in_cluster_of_mode` guard in `join_queue` gives this for free. User can hold `generation` + birth + local + open_mix simultaneously (still 6 modes total — replacement, not addition). |
| Queue constraint | `one_queue_per_mode` reused as-is | One `generation` queue entry per user. |
| Location | Not required | `join_queue` location gate stays `local`-only. `generation` needs only `dob is not null`. |
| Cooldown | 30 days (same as all birth modes + local) | Only `open_mix` is 7 days via `fn_cooldown_interval` (`0132`). No helper change needed; `cooldownDaysForMode('generation') === 30`. |
| Replacement eligibility | Unchanged | Same-queue match first, then top-up, longest-waiting deterministic (`0141`/`0143`). 5-year bands backfill faster than `birth_year_month`, slower than `open_mix` — intended. |
| Discovery/privacy | Same as other modes | Tiles show active-cluster count; mode page shows name/status/member-count/formation-date only. |
| Onboarding | `generation` offered like any birth mode; `open_mix` stays the only pre-selected default | No default-selection change in this plan. |
| Beta cleanup | Delete all `birth_month` queues, clusters (cascade), cooldowns in the migration | Product is beta-only per user answer. No freeze, no dual-run, no member migration. Staging beta data auto-cleans on merge via `migrate-staging.yml`. |

### 1.1 Explicitly out of scope

- Named-generation keys (`gen_z`, `millennial`). Too coarse (16-year spans recreate the month age-spread problem), contested boundaries, Gen Alpha mostly <18 and ineligible per `0002_profiles.sql:20`, leaving ~3 live queues.
- Rolling windows (`dob ± 2yr`). Needs overlap matching, not exact-key; would require a new matching engine and breaks `maybe_form_cluster`, `source_candidates`, deterministic replacement.
- Sex / sexuality / custom filters. Needs new sensitive PII, verification, anti-exclusion design — separate proposal, not this plan.
- Total-cluster cap, thin-pool broaden prompt (`docs/PRD.md:87`). Unchanged.
- Removing `'birth_month'` from the Postgres enum type. PG cannot `DROP VALUE` without rebuilding the type + all dependents. Leave the value in the type, unused and join-blocked (see §3). Never attempt a type rebuild in this plan.

---

## 2. Current-state map (files that must change)

### 2.1 Backend (Supabase / Postgres)

| File | What hardcodes `birth_month` / needs work |
|---|---|
| `supabase/migrations/0001_enums.sql:3` | `matching_mode` definition. Immutable — new value via new migration only. |
| `supabase/migrations/0011_matching_functions.sql:3` | Original `fn_queue_key` / `fn_mode_label` / `join_queue`. Superseded but read for history. |
| `supabase/migrations/0020_fix_mode_label.sql:7` | One of the live `fn_mode_label` bodies. Must gain `generation` branch; keep `birth_month` branch as deprecated back-compat. |
| `supabase/migrations/0132_open_mix_queue_cooldown.sql:14` | Live `fn_queue_key` + `fn_mode_label` + `fn_cooldown_interval` + `leave_cluster` + `get_my_matching_status`. Copy these bodies verbatim as the rewrite base. |
| `supabase/migrations/0138_hot_write_rate_limits.sql:98` | Live `join_queue` (rate-limited wrapper). Add `generation` support (automatic via `fn_queue_key`) + explicit `birth_month → mode_retired` guard. |
| `supabase/migrations/0003_queues_clusters.sql:3` | `queue_entries`, `clusters`, `cluster_members` (cascade deletes), `mode_cooldowns`. No schema change; cleanup `DELETE`s rely on `clusters(id) ON DELETE CASCADE` (members, `messages` via `0004`, reactions via messages, signals/posts/votes/replacement children). Verify with `grep "references public.clusters(id)"` before writing the migration. |
| `supabase/migrations/0135_queue_status_scoped_counts.sql` / `0018` | `get_my_matching_status` enumerates via `enum_range` (auto-picks up `generation`) + `fn_queue_key` (needs new branch or key is null). No structural change. |
| Grants | No new tables/functions. If `fn_cooldown_interval` grant pattern from `0132` is followed, no new grant needed. |

### 2.2 Frontend (web)

| File | Change |
|---|---|
| `src/lib/modes.ts:5` | Replace `'birth_month'` with `'generation'` in `MatchingMode`; replace entry in `MATCHING_MODES` at the same index (keeps tile order stable): `{ value: 'generation', label: 'Generation', detail: 'Born within the same 5 years', icon: Users }`. Remove `Calendar` import if unused elsewhere; import `Users` from lucide-react. |
| `src/lib/modes.test.ts:5` | Update six-value order assertion; `modeInfo('generation')` label/detail; `isMatchingMode('generation') === true`, `isMatchingMode('birth_month') === false`; `cooldownDaysForMode('generation') === 30`. |
| `src/lib/error.ts:37` | No logic change (30-day default already covers `generation`). Optional: assert message for `generation` in tests. |
| `src/pages/onboarding/step-modes.tsx:31` | Renders from `MATCHING_MODES` — automatic. Update helper copy `:69` to mention 5-year cohorts (e.g. "Generation groups you with people born within the same 5 years."). |
| `src/pages/ClustersPage.tsx:53` | Tiles from `MATCHING_MODES` — automatic. |
| `src/pages/DiscoveryModePage.tsx:10` | `isMatchingMode`/`modeInfo` gate — automatic. Old `/discovery/birth_month` links must be removed/redirected (search for hardcoded `birth_month` routes). |
| `src/pages/discovery/ModePanel.tsx:82` | `queueKey` for `generation` is a displayable range (`2000-2004`) — no override needed (unlike `open_mix` `'open'`). Verify heading renders raw key + `modeInfo` label sensibly. |
| `src/features/matching.ts` | No logic change (RPC names unchanged). |
| `src/lib/database.types.ts:2981` | Regen after migration; `sync:db-types` for mobile. Never hand-edit except to unblock. |
| `src/components/ClusterCard.test.tsx:12`, `PublicClusterCard.test.tsx:11` | Fixtures use `birth_month` — update at least one to `generation` to cover the new mode in render tests. Type still accepts `birth_month` (enum value remains) so un-updated fixtures still compile; update for intent clarity. |

### 2.3 Seed / tests / e2e (web)

| File | Change |
|---|---|
| `scripts/seed-demo.mjs:218` | Delete `April Bloom` + `December Nights` (`birth_month`) clusters; add 1-2 `generation` clusters, e.g. `{ name: 'Early 2000s', mode: 'generation', modeLabel: 'Born 2000-2004', queueKey: '2000-2004', members: [...] }`. Make member PEOPLE DOBs fall inside the band for realism (future replacement backfill matches on real DOBs; seed rows are pre-formed so no constraint, but keep them truthful). Update header comment if it counts modes. |
| `tests/integration/matching.test.ts` | Add: `join_queue('generation')` key math (1996-07-12 → `1995-1999`; 2000-01-01 → `2000-2004`; 1999-12-31 → `1995-1999` boundary case); 8 same-band users form one cluster; cross-band users do not merge; `join_queue('birth_month')` rejects with `mode_retired`; `get_my_matching_status` includes `generation` with non-null key/label. |
| `tests/integration/discovery.test.ts:94` | Uses `birth_month` fixtures — switch to `generation` (or `birth_year`) so the suite does not imply month support. |
| `tests/integration/governance.test.ts` | Cooldown assertions unchanged (30d); optionally assert `leave_cluster` on `generation` writes ~30d. |
| `e2e/golden-path.spec.ts:28` | Tile → `/discovery/generation` navigation assertion; remove/replace any `birth_month` tile assertion. Tests select by `data-e2e`. |
| `src/pages/onboarding/OnboardingPage.test.tsx` | Mocks `step-modes`; no change unless copy asserted. |

### 2.4 Mobile (`mobile/` — mirrors web, do not hand-edit generated copies)

| File | Change |
|---|---|
| `mobile/src/lib/modes.ts:8` | Same replacement entry (`Users` icon from lucide-react-native). |
| `mobile/src/lib/database.types.ts:2981` | Via `cd mobile && npm run sync:db-types`. |
| `mobile/src/components/onboarding/StepModes.tsx:3`, `mobile/app/(app)/clusters.tsx:6`, `mobile/app/(app)/mode/[modeId].tsx:14` | Automatic via shared modes module; verify no hardcoded `birth_month` strings remain (`grep birth_month mobile`). |
| `mobile/src/features/realtime.ts` | Pinned — reconcile by hand, do not overwrite. See `mobile/README.md`. |

### 2.5 Docs (source of truth — update in the same PR)

- `docs/PRD.md:66` modes table (replace Birth Month row with Generation: `Matched with people born within the same 5 years`), `:145` Cluster Joining list, `:651` Cluster Types, `:809` onboarding toggles, success metrics mode breakdown (stays 6 modes, name changes).
- `docs/ARCHITECTURE.md:78` if it enumerates mode names or counts — stays six, update name.
- `docs/TECHNICAL.md` migration-range section (new `0146–0147` entries) + any mode list.
- `README.md:38` matching bullet if it names modes.
- `mobile/README.md` if it enumerates modes.
- `docs/archive/README.md` table — add this plan after ship.

---

## 3. Backend implementation (migrations)

**Numbering:** head is `0145`. Use **two** migrations (`ALTER TYPE … ADD VALUE` cannot run in the same transaction as functions consuming the new label):

- `0146_generation_enum.sql` — enum only.
- `0147_generation_replace_month.sql` — beta cleanup + `fn_queue_key` / `fn_mode_label` rewrites + `join_queue` retire guard.

Both must pass `supabase db lint --local`.

### 3.1 `0146_generation_enum.sql`

```sql
-- 0146 - Generation matching mode (enum only; kept separate so the new label
-- is committed before any function body references it).
alter type public.matching_mode add value if not exists 'generation';
```

Verify: `select enumrange(null::public.matching_mode);` shows 7 values (`birth_month` retained, unused).

### 3.2 `0147_generation_replace_month.sql`

**3.2.1 Beta cleanup (order matters — children before parents where no cascade, clusters last):**

```sql
-- Beta-only cleanup: product not live, all month queues/clusters/cooldowns removed.
delete from public.queue_entries where mode = 'birth_month';
delete from public.mode_cooldowns where mode = 'birth_month';
delete from public.clusters where matching_mode = 'birth_month';
-- clusters delete cascades to cluster_members, messages (+reactions via
-- messages), signals, votes, replacement rounds/invitations, posts, notifications
-- via cluster_id FKs. Verify pre-write with:
--   grep -rn "references public.clusters(id)" supabase/migrations
-- Post-apply assert (manual): zero month rows remain:
--   select count(*) from public.queue_entries where mode = 'birth_month';
--   select count(*) from public.clusters where matching_mode = 'birth_month';
--   select count(*) from public.mode_cooldowns where mode = 'birth_month';
```

If any child table lacks `ON DELETE CASCADE` on `cluster_id`, delete its month rows explicitly before the `clusters` delete (discover via the grep above; do not assume).

**3.2.2 `fn_queue_key` — add `generation`, keep `birth_month` as deprecated back-compat:**

```sql
create or replace function public.fn_queue_key(
  p_mode matching_mode, p_dob date, p_country text, p_area text, p_radius int
) returns text language sql immutable as $$
  select case p_mode
    when 'exact_birthdate' then to_char(p_dob, 'YYYY-MM-DD')
    when 'birth_year_month' then to_char(p_dob, 'YYYY-MM')
    when 'birth_month' then to_char(p_dob, 'MM')  -- deprecated: beta cleanup above; retained so stray rows never yield null keys
    when 'birth_year' then to_char(p_dob, 'YYYY')
    when 'generation' then
      ((extract(year from p_dob)::int / 5 * 5)::text || '-' || ((extract(year from p_dob)::int / 5 * 5) + 4)::text)
    when 'local' then upper(coalesce(p_country, '')) || ':' || coalesce(p_area, 'unknown') || ':' || coalesce(p_radius, 0)::text
    when 'open_mix' then 'open'
  end;
$$;
```

Integer division semantics: `1996 / 5 = 399` → `399*5 = 1995` → `'1995-1999'`. Boundaries: `1999-12-31 → 1995-1999`, `2000-01-01 → 2000-2004`. Document in comment. `p_dob` null yields null key — same as existing birth branches; `join_queue` already rejects null dob first.

**3.2.3 `fn_mode_label` — rewrite the live body from `0132`, add `generation`:**

```sql
when 'generation' then 'Born ' || p_key
-- keep: when 'birth_month' then ... (deprecated, same comment as above)
```

All other branches byte-identical to `0132:32-45`.

**3.2.4 `join_queue` (base on live `0138` body) — retire `birth_month`:**

- First line after auth/onboarding checks: `if p_mode = 'birth_month' then raise exception 'mode_retired'; end if;`
- Everything else verbatim: `dob is null` check, `cooldown_active`, `already_in_cluster_of_mode` (gives 1-active-`generation` rule free), `local`-only location gate, `v_key := fn_queue_key(...)`, `one_queue_per_mode` insert.
- `generation` needs no special-casing (no radius, no location).

**3.2.5 `get_my_matching_status`, `maybe_form_cluster`, `get_queue_count`, `get_my_queue_keys`, `leave_queue`, triggers, `fn_cooldown_interval`** — no change. `enum_range` auto-includes `generation`; keys/labels resolve via the rewritten `fn_*`; cooldown stays 30d via the `else` branch.

### 3.3 Realtime / cron / storage

No changes. Queue-count polling (`useQueueCount`), `pg_notify('queue_update', …)`, intro/cron, bucket policies are mode-agnostic.

---

## 4. Frontend implementation (web)

### 4.1 `src/lib/modes.ts`

```ts
import { Cake, CalendarCheck, CalendarDays, MapPin, Shuffle, Users } from 'lucide-react'
export type MatchingMode =
  | 'exact_birthdate' | 'birth_year_month' | 'generation' | 'birth_year' | 'local'
  | 'open_mix'
{ value: 'generation', label: 'Generation', detail: 'Born within the same 5 years', icon: Users },
```

Replace in place at index 2 (same slot `birth_month` occupied) so tile order/snapshots don't shift. Drop `Calendar` import only if unused elsewhere in the file.

### 4.2 Copy updates

- `step-modes.tsx` helper (`:69`): e.g. "Generation groups you with people born within the same 5 years — same life stage, still strangers."
- No `ModePanel` override needed (key `2000-2004` is displayable). Confirm `JoinedCard`/`JoinCard` heading shows key + label without the `open_mix`-style special case.
- Grep for hardcoded `birth_month` / `Birth Month` strings in `src` (routes, copy, tests, seed) and replace or delete. Enum value remains in generated types but must have zero UI references.

### 4.3 Generated types

After `supabase db reset`, regen `src/lib/database.types.ts`, then `cd mobile && npm run sync:db-types`. Verify with `node mobile/scripts/sync-db-types.mjs --check` per `AGENTS.md` pre-push.

---

## 5. Seed, tests, and docs updates

### 5.1 `scripts/seed-demo.mjs`

Replace the two `birth_month` cluster entries with, e.g.:

```js
{ name: 'Early 2000s', mode: 'generation', modeLabel: 'Born 2000-2004',
  queueKey: '2000-2004', status: 'active', formedDaysAgo: 30, members: [...] },
{ name: 'Late 90s', mode: 'generation', modeLabel: 'Born 1995-1999',
  queueKey: '1995-1999', status: 'active', formedDaysAgo: 3, members: [...] },
```

Align member PEOPLE DOBs to the band. Keep `Aurora` untouched (E2E depends on it).

### 5.2 Unit tests (Vitest, colocated)

- `src/lib/modes.test.ts` — order assertion with `generation` at index 2; `modeInfo('generation')` label/detail/icon; `isMatchingMode('birth_month') === false`; `cooldownDaysForMode('generation') === 30`.
- `src/lib/error.test.ts` — optional cooldown-message assertion for `generation` (30-day).
- Coverage gate (`vite.config.ts`: lines 34%, functions 33%, branches 20%) must still pass via `npm run test:coverage`. Never lower thresholds.

### 5.3 Integration tests (`tests/integration/`, requires `supabase start`)

`matching.test.ts` additions:
1. Key math: `1996-07-12 → 1995-1999`; `2000-01-01 → 2000-2004`; `1999-12-31 → 1995-1999`; `2004-12-31 → 2000-2004`.
2. 8 same-band users → one `clusters` row (`matching_mode 'generation'`, correct `queue_key`, `mode_label 'Born …'`), 8 members, 0 remaining queue entries, 8 `cluster_formed` notifications.
3. Cross-band users do not merge (e.g. 7 × `1995-1999` + 1 × `2000-2004` → no cluster, `waiting` counts split).
4. `join_queue('birth_month')` rejects (`mode_retired`).
5. `get_my_matching_status` row for `generation` has non-null key/label + correct `joined`/`waiting`.
6. `already_in_cluster_of_mode` blocks a second `generation` cluster while active.
7. Post-cleanup: zero `birth_month` queue/cluster/cooldown rows (assert the migration's effect on a fresh `db reset`).

Update `discovery.test.ts` fixtures off `birth_month`.

### 5.4 E2E (Playwright, requires `supabase start` + `npm run seed:demo` + chromium)

- `golden-path.spec.ts` — `/clusters` → `/discovery/generation` renders join/queued state. Remove `birth_month` tile assertions.

### 5.5 Mobile acceptance

- Onboard → select Generation → queue → (8 same-band test users) cluster forms → room; leave copy shows 30-day; tiles + directory render. `mobile` lint/typecheck per `mobile/README.md`.

---

## 6. Execution order + verification

1. `0146` → `supabase db reset` → enum contains `generation` (7 values).
2. `0147` → `supabase db reset` → `supabase db lint --local` clean → assert zero `birth_month` rows + `fn_queue_key('generation','1996-07-12',…)` = `'1995-1999'`.
3. Regen `database.types.ts` → `sync:db-types` → `--check` passes.
4. Web edits (§4) + `modes.test.ts` updates; `grep -rn birth_month src mobile scripts tests e2e supabase/migrations` — only hits allowed: old migration bodies, deprecated `fn_*` branches + comment, generated-types history (regen removes `birth_month`? No — enum value retained so it stays in types), this plan.
5. `npm run lint` clean.
6. `npm test <touched-files>` → `npm run test:coverage` (gate passes).
7. `npm run build` passes.
8. `npm run test:integration` against local stack.
9. `npm run seed:demo` → `/clusters` shows 6 tiles (Generation, no Birth Month), `/discovery/generation` queue works.
10. `npm run test:e2e`.
11. Docs updates (§2.5) in the same branch.
12. Pre-push per `AGENTS.md`: `lint` + `test:coverage` + `build`; migrations changed → `db reset` + `test:integration` done above; synced web file changed → `sync-db-types --check` done above.

Branch from `develop` as `feat/generation`, PR into `develop` (squash). Never touch `main`. Migrations apply to staging on merge, prod only via `develop` → `main` release (merge commit, after `npm run check:release`).

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `ALTER TYPE … ADD VALUE` transaction pitfalls | Split enum/function migrations; `db reset` from scratch in CI. |
| Live `fn_*` / `join_queue` bodies drifted since `0132`/`0138` | Copy current bodies verbatim; `grep "birth_month"` + `grep "30 days"` to catch every override before writing `0147`. |
| Child table without cascade breaks beta `clusters` delete | Pre-write `grep "references public.clusters(id)"`; add explicit deletes for any non-cascade child. |
| Attempting to drop `birth_month` enum value | Do not. Leave value, retire via guard + UI removal. Type rebuild is out of scope. |
| Band-boundary complaints (1999 vs 2000 split) | Same as existing Dec/Jan `birth_year` split; document in Discovery copy. No code fix. |
| `generation` cannibalizes `birth_year` queues | Track mode-popularity + avg-clusters-per-user (PRD metrics). Positioning: Generation = life-stage breadth, Birth Year = exact cohort. |
| Stale mobile mirror | `sync:db-types` + hand-reconcile `realtime.ts`; `mobile.yml` must pass. |
| Stale `birth_month` references | `grep` gate in §6.4; E2E covers tile removal. |
| Forgetting docs | PR checklist: PRD table/joining/types/toggles, ARCH count, TECH ranges, README bullet, archive record post-ship. |

---

## 8. Locked decisions (no open questions)

1. **Bands are 0-anchored 5-year: `floor(year/5)*5`.** e.g. `1995-1999`, `2000-2004`. No nickname keys.
2. **Beta month data is deleted, not migrated.** Queues + clusters (cascade) + cooldowns in `0147`.
3. **Enum value `generation`, label `Born <range>`.** Detail `Born within the same 5 years`. Years-only, no Gen Z/Millennial helper.
4. **Cooldown 30 days.** No `fn_cooldown_interval` change.
5. **In-place replacement (6 modes stay 6).** `generation` takes `birth_month`'s slot in `MATCHING_MODES` order.
6. **`birth_month` enum value stays in the type.** Retired by guard + UI removal + data cleanup, not by type surgery.

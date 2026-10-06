# Local Age Filter - Implementation Plan

**Status:** Implemented and validated (`supabase db reset` applies `0190` cleanly, `db lint --local` has no findings on new functions, `test:integration` 34 files / 350 tests pass including 6 new age-prefs cases)
**Scope:** Age-only mutual filter for Local mode. No sex, no gender, no identity fields.
**Goal:** Let Local users optionally restrict grouping by age range, with mutual enforcement and live compatible counts, without displaying anyone's age or DOB.

**Non-goals:**
- Sex or gender filtering (explicitly deferred, see section 8 for why).
- Showing age, DOB, or birth year anywhere for Local.
- Changing `CLUSTER_SIZE` (still 8), changing radius buckets (still 10/50/100), changing lifecycle or cooldowns.
- Auto-broaden prompt (PRD Thin Pool Handling, separate plan).

---

## 1. Current state

| Area | File | Behavior today |
|---|---|---|
| DOB | `supabase/migrations/0002_profiles.sql:7` | `dob date`, immutable via `protect_dob()`, 18+ CHECK. Derived `birth_year/month/day` stored columns |
| Local keys | `0147` live `fn_queue_key`, hardened in `0164` | Local key is `UPPER(local_country_code):area:radius`. Formation is first-8 in same key via `maybe_form_cluster` |
| Member profiles | `supabase/migrations/0189_drop_availability.sql:16` (`get_member_profiles`) | Returns `birth_year` to all active members of any cluster, including Local |
| Queue UI | `src/pages/discovery/ModePanel.tsx:212` (`LocalSetupCard`, `JoinCard`) | Radius picker with per-bucket `useQueueCount`, join/leave dialogs, no prefs |
| Matching hooks | `src/features/matching.ts:122` | `useQueueCount`, `useJoinQueue`, `useMyQueueStatus`. No compatible-count concept |
| Mobile mirror | `mobile/src/components/discovery/ModePanel.tsx`, `mobile/src/features/matching.ts` | Same logic, synced by script, do not hand edit generated copies |
| Cooldowns | `0167` `fn_cooldown_interval` | Local 3 days, enforced in `leave_cluster` and vote-removal paths |

---

## 2. Product decisions (locked)

| Decision | Value | Rationale |
|---|---|---|
| Filter type | Age-only, mutual | Sex was rejected: unverifiable self-report, trans exclusion, pool fragmentation x3, moderation load. Age reuses trusted immutable DOB |
| Mutual semantics | `A matches B` iff age of B is inside A's range (or A is Any) AND age of A is inside B's range (or B is Any) | One-sided would group people with others they did not agree to. Copy is "comfortable being grouped with" |
| Default | Any age (both bounds null) | Preserves current behavior and largest pools. Opt-in narrowing only |
| Range model | Closed interval `[min, max]`, 18 to 99 inclusive, or null/null for Any. No single-sided ranges in v1 | Keeps UI (dual slider + Any reset) and SQL simple. Single-sided adds little for Local density cost |
| Display | No ages shown anywhere for Local | `birth_year` is suppressed for Local clusters (section 3.5). Counts only, never raw values |
| Age source | Computed from `dob` at match time via `date_part('year', age(current_date, dob))` | No stored age to drift. DOB stays the single source of truth |
| Queue key | Unchanged (`country:area:radius`) | Prefs are not part of the key. Compatibility is a subset filter inside the radius pool |
| Formation | Greedy earliest-formable 8-clique: each waiter tried as seed in `joined_at` order, first 8-clique found forms | A narrow head waiter cannot stall the area; they keep waiting per the longer-wait warning |
| Replacement | Longest-waiting waiter mutually compatible with all 7 remaining members | Prevents drift off-spec after leaves or votes |

---

## 3. Backend plan (one migration, `0190`)

New file: `supabase/migrations/0190_local_age_prefs.sql`.

1. Schema:
   - `alter table public.profiles add column local_pref_age_min smallint;`
   - `alter table public.profiles add column local_pref_age_max smallint;`
   - Constraint: both null (Any) or both set with `18 <= min <= max <= 99`:
     `check ((local_pref_age_min is null and local_pref_age_max is null) or (local_pref_age_min is not null and local_pref_age_max is not null and local_pref_age_min >= 18 and local_pref_age_max <= 99 and local_pref_age_min <= local_pref_age_max))`
   - Existing rows default null, meaning Any. No backfill needed.
2. Helper (immutable):
   - `public.age_of(p_dob date) returns smallint` as `date_part('year', age(current_date, p_dob))::smallint`. Used by all match SQL so age math stays in one place.
3. Compatibility predicate (immutable, server-side only):
   - `public.local_age_compatible(p_seeker_min smallint, p_seeker_max smallint, p_seeker_age smallint, p_other_min smallint, p_other_max smallint, p_other_age smallint) returns boolean`
   - Null min/max means Any on that side. Both directions must pass.
4. Count RPC (security definer, granted to authenticated):
   - `get_local_compatible_count(p_queue_key text, p_min smallint, p_max smallint) returns integer`
   - Counts `queue_entries` in caller's radius key where each waiter is mutually compatible with the caller's (age, prefs) and caller is mutually compatible with theirs. Caller's own row excluded or included consistently (decide: exclude, display "N others match").
   - Returns count only. No DOB, age, or pref columns in output. RLS-safe by construction.
5. Prefs write path:
   - Allow self-update via existing `profiles self update` policy (prefs are non-sensitive own data). CHECK enforces range validity.
   - Add `set_local_age_prefs(p_min smallint, p_max smallint)` security definer wrapper that validates (`invalid_age_range` exception) and updates, so web/mobile have one error surface and custom clients cannot bypass messaging. Optional but recommended for clean `joinQueueErrorMessage` mapping.
6. Formation (`maybe_form_cluster`, full replace of live body):
   - Non-local modes: byte-identical behavior.
   - Local branch: fetch waiters for the key ordered by `joined_at`, compute ages in CTE, greedily build a set starting from the longest waiter, adding each next waiter only if mutually compatible with every member already in the set. When the set reaches 8, form as today (same cluster insert, member inserts, notification fan-out, queue cleanup). If no 8-clique exists, do nothing.
   - Keep cron batch limits from `0136` unchanged.
7. Replacement (candidate selection in `0142/0143` path):
   - Local clusters: order eligible candidates by waiting time, pick the first mutually compatible with all 7 remaining members. If none, leave the vacancy open until a compatible waiter appears (existing `progress_replacements()` safety net keeps retrying).
   - Non-local: unchanged.
8. Read-surface hardening:
   - Re-issue `get_member_profiles` so `birth_year` returns null when the target cluster's `matching_mode = 'local'`. All other modes unchanged. Keeps the "never shown for Local" promise without breaking birth-mode identity (Exact Birthdate still needs its detail).
    - `get_my_matching_status` is untouched: clients read their own prefs from self-readable `profiles` via `useProfile`, so no status shape change was needed. Do not expose others' prefs.
   - No new tables. No grants beyond the new count RPC plus re-issued grants after any drop/create.
9. Validate: `supabase db reset`, `supabase db lint --local`.

---

## 4. Frontend plan (web)

1. `src/features/matching.ts`:
   - `useSetLocalAgePrefs()` mutation wrapping `set_local_age_prefs` (or direct profile update if wrapper is skipped). Invalidates `matching-status`, `my-queues`, `queue-count`, plus new compatible-count key.
   - `useLocalCompatibleCount(queueKey, min, max)` wrapping `get_local_compatible_count`, same polling profile as `useQueueCount` (60s interval, paused in background, shared via TanStack dedup).
   - Extend `joinQueueErrorMessage` in `src/lib/error.ts` with `invalid_age_range`.
2. New `MatchPreferences` sheet (route or modal from Local `JoinCard`, mirroring the mock):
   - Dual slider 18 to 99, current label (`25 to 35 years` or `Any age`), `Any age` reset button.
   - Live line: `N people match these preferences` via the new hook. Sub-line: `Join the Local queue to be grouped with 7 strangers who match your preferences.`
   - Warning box when narrowed: `Narrower preferences may take longer to form a cluster.` Show whenever prefs are not Any, stronger when compatible count is below 7.
   - `Save preferences` persists without joining. Join stays explicit on the Local card.
   - Tailwind tokens only from `docs/DESIGN.md`, min touch target 44px, `data-e2e` attributes for Playwright.
3. `src/pages/discovery/ModePanel.tsx`:
   - Local `JoinCard`: add `Match preferences - Optional` row showing current prefs summary (`25 to 35 years` or `Any age`), chevron to the sheet. Join blurb stays radius-based plus prefs summary. Pass-through of prefs on join is implicit (server reads stored prefs), so no `join_queue` signature change.
   - `JoinedCard`: show prefs summary while queued, with edit link that updates prefs in place (no requeue needed, prefs apply to future formation attempts).
   - `LocalSetupCard`: no change except prefs entry point appears after area plus radius are set.
4. `src/lib/database.types.ts`: regen after migration, do not hand edit.

---

## 5. Mobile plan

Synced files via `mobile/scripts/sync-db-types.mjs` (regen plus `--check` in CI): `database.types.ts`, `features/matching.ts`, `lib/error.ts`. Hand-maintained mirrors (edit in both places): `MatchPreferences` screen under `mobile/app/(app)/clusters/` or as a sheet from `ModePanel`, plus `mobile/src/components/discovery/ModePanel.tsx` prefs row and counts. `expo` slider component choice must support dual thumbs and screen-reader labels; if no suitable built-in exists, use two single sliders (min, max) with the same validation.

---

## 6. Tests

- Unit (colocated, Vitest jsdom):
  - Prefs validation helper: null/null passes, min>max fails, under 18 or over 99 fails.
  - `MatchPreferences` copy: Any default, range label, warning appears when narrowed.
  - `ModePanel` prefs summary renders Any vs range.
- Integration (`tests/integration/`, needs `supabase start`, fresh `supabase db reset` with no demo seed):
  - 8 Any waiters in one radius key form as today.
  - 8 waiters with overlapping ranges (all 25-35, ages inside) form one cluster.
  - Cross-age waiters do not merge: seven 25-35 plus one 60 seeking 55-70 stays queued.
  - One-sided mismatch does not form: A (30, seeking 25-35) plus seven 22-year-olds seeking 20-25 stays queued even though A likes them.
  - Replacement picks a compatible waiter and skips an incompatible longer-waiting one.
  - `get_local_compatible_count` returns counts only and never leaks DOB or prefs.
  - Direct profile update violating the CHECK fails.
  - `get_member_profiles` returns null `birth_year` for Local members, non-null for birth modes.
- E2E (Playwright, needs seed plus chromium):
  - Set 25-35 prefs, see compatible count, save, join queue.
  - Narrow prefs show the longer-wait warning.
- Coverage gate (`npm run test:coverage`, lines 34 percent, functions 33 percent, branches 20 percent in `vite.config.ts`) must not regress. Never lower thresholds.

---

## 7. Rollout and verification

1. `supabase start`, then `supabase db reset`, rerun `npm run seed:demo`.
2. `supabase db lint --local`.
3. `npm run lint`.
4. `npm run test:coverage`.
5. `npm run build` (runs `tsc -b` plus `vite build`).
6. `npm run test:integration`.
7. `node mobile/scripts/sync-db-types.mjs --check`, commit regenerated mobile copies.
8. `npm run test:e2e` (config starts Vite itself, needs `npx playwright install chromium`).
9. Docs: update `docs/PRD.md` Local row (radius plus optional mutual age prefs, Any default), `docs/TECHNICAL.md` queue follow-ups line. Leave `docs/archive/` untouched.

Branch from `develop` as `feature/local-age-filter`, PR into `develop`. Conventional Commits. Pre-push per `AGENTS.md`.

---

## 8. Why sex filtering is deferred

Recorded during scoping, kept here so the decision sticks:

- New sensitive column with no existing source of truth (DOB already exists and is immutable).
- Self-report is unverifiable without ID checks, so Female-only becomes trust-based and raid-prone.
- Binary buckets exclude trans, nonbinary, and intersex users unless paired with a separate gender question plus variation disclosure, which is a second feature on its own.
- Pool fragmentation multiplies (radii x age bands x sex options), making 8-way mutual formation much slower.
- Composition alone would leak the attribute even though it is never displayed.

Revisit only with an explicit safety design (verification or moderation story) and a pool-density plan. Age-only ships first.

---

## 9. Explicitly out of scope

- Sex, gender, pronouns changes (pronouns stay as-is, free text, shown).
- Single-sided age ranges, preset chips beyond Any plus slider.
- Thin-pool auto-broaden, wait-time estimates, map previews.
- Changing onboarding required fields for non-Local users.
- Backfilling prefs for existing users (they default to Any).

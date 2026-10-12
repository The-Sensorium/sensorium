# Open Mix Age Filter - Implementation Plan

**Status:** Implemented and validated (`0191`; web + mobile + unit and integration tests). `supabase db reset` applies `0191` cleanly, `db lint --local` has no findings on the new functions, `test:integration` passes 34 files / 357 tests including 6 new open-mix age-prefs cases, and the full UI flow was walked in the browser (prefs sheet, save, join, match line, zero console errors). `database.types.ts` was hand-synced to the `0191` shape; regen from the stack when possible to confirm byte-identical output. `test:e2e` not yet run.
**Scope:** Optional mutual age-only filter for Open Mix, mirroring the Local filter from `0190`. No sex, no gender, no identity fields.
**Goal:** Close the consistency gap (birth modes filter by construction, Local has optional prefs, Open Mix has nothing) while preserving the Open Mix fast-path default. Default stays Any age, so current FIFO behavior is unchanged unless the user narrows.

**Non-goals:**
- Changing `CLUSTER_SIZE` (still 8), changing the Open Mix global queue key (still `'open'`), changing lifecycle or cooldowns (Open Mix stays 3 days).
- Showing or hiding any new personal data. Open Mix already exposes `birth_year` via `get_member_profiles`; no read-surface change.
- Single-sided ranges, preset chips beyond Any plus slider, thin-pool auto-broaden, wait-time estimates.
- Backfilling prefs for existing users (they default to Any).

---

## 1. Current state

| Area | File | Behavior today |
|---|---|---|
| Open Mix queue | `fn_queue_key` live body, `0131/0132` | Single global key `'open'`, first-8 FIFO in `maybe_form_cluster` |
| Open Mix copy | `src/lib/modes.ts:31`, `src/pages/discovery/ModePanel.tsx:114-117` | Detail "First 8 in, no birth-date or location filter", blurb "whoever they are" |
| Local prefs | `supabase/migrations/0190_local_age_prefs.sql` | `profiles.local_pref_age_min/max` (null/null is Any), CHECK `18 <= min <= max <= 99` |
| Local helpers | `0190:38-57` | `age_of(dob)` stable, `local_age_compatible(...)` immutable, revoked from clients |
| Local RPCs | `0190:59-119` | `set_local_age_prefs`, `get_local_compatible_count(p_queue_key, p_min, p_max)` |
| Local formation | `0190:132-220` (`maybe_form_cluster`, live body was `0142`) | Non-local path is plain first-8; Local path is greedy earliest-formable 8-clique |
| Local replacement | `0190:225-398` (`source_candidates`, live body was `0143`) | Non-local path unchanged; Local path requires mutual compatibility with all remaining members |
| Member profiles | `0190:402-450` (`get_member_profiles`, live body was `0189`) | `birth_year` is null for `local` clusters, non-null otherwise (includes `open_mix`) |
| Web hooks | `src/features/matching.ts:234-322` | `LOCAL_AGE_MIN/MAX`, `formatAgePrefs`, `useSetLocalAgePrefs`, `useLocalCompatibleCount`, `useLocalMatchLine` (local-gated) |
| Web UI | `src/components/MatchPreferences.tsx`, `src/pages/discovery/ModePanel.tsx:134-153,228-252` | `MatchPreferencesSheet` + `AgeRangePicker`, prefs row rendered only when `mode === 'local'` |
| Mobile UI | `mobile/src/components/MatchPreferencesSheet.tsx`, `mobile/src/components/discovery/ModePanel.tsx:146-180,241-281`, `mobile/src/components/AgeRangeSlider.tsx` | Same gating (`mode === 'local'`), `AgeRangeSlider` reusable as-is |
| Mobile sync | `mobile/scripts/sync-db-types.mjs` | `database.types.ts`, `features/matching.ts`, `lib/error.ts` are generated copies; `ModePanel` + `MatchPreferencesSheet` are hand-maintained mirrors |
| Error copy | `src/lib/error.ts:52-54` | `invalid_age_range` already mapped, no change needed |
| Tests | `tests/integration/matching.test.ts:568-751`, `src/features/matching.test.tsx:192-239`, `src/components/MatchPreferences.test.tsx` | Local-only coverage today |

---

## 2. Product decisions (proposed, to lock)

| Decision | Value | Rationale |
|---|---|---|
| Filter type | Age-only, mutual, same semantics as Local | `A matches B` iff B's age is inside A's range (or A is Any) AND A's age is inside B's range (or B is Any). One-sided would group people with others they did not agree to. |
| Default | Any age (both bounds null) | Preserves the Open Mix bridge promise: fastest formation, no new friction unless opted in. |
| Range model | Closed interval `[min, max]`, 18 to 99 inclusive, or null/null for Any | Same as Local v1. No single-sided ranges. |
| Column shape | Separate `open_mix_pref_age_min/max` (not reuse of `local_pref_*`) | Reuse would couple the two modes: setting Local 25-35 would silently narrow Open Mix too. Separate columns cost one migration and keep prefs predictable per mode. |
| Helper reuse | Reuse `age_of()` and `local_age_compatible()` as-is | Both are mode-agnostic math. The `local_` name is historical; a comment notes shared use. Avoids a rename plus wrapper churn across `0190` call sites. |
| Display | No `get_member_profiles` change; Open Mix keeps `birth_year` | Local suppressed it as part of its "never shown" promise. Open Mix already shows it, so the filter adds no new exposure and no UI regression. |
| Queue key | Unchanged (`'open'`) | Prefs are a subset filter inside the global pool, same as Local radius pools. |
| Formation | Same greedy earliest-formable 8-clique as Local | A narrow head waiter cannot stall the global queue; they keep waiting with the longer-wait warning. |
| Replacement | Longest-waiting waiter mutually compatible with all 7 remaining members | Same as Local; vacancies stay open until a compatible waiter appears (`progress_replacements()` retries). |

Copy updates: `modes.ts` detail drops "no birth-date ... filter" for Open Mix (becomes "First 8 in, optional age prefs"), `ModePanel` blurb becomes mode-aware, `MatchPreferencesSheet` sub-line becomes "Join the Open Mix queue ..." when `mode === 'open_mix'`.

---

## 3. Backend plan (one migration, `0191`)

New file: `supabase/migrations/0191_open_mix_age_prefs.sql`.
Live bodies: `maybe_form_cluster` is `0190:132-220`, `source_candidates` is `0190:225-398`, `get_member_profiles` is `0190:402-450`. Never edit those files.

1. Schema:
   - `alter table public.profiles add column open_mix_pref_age_min smallint;`
   - `alter table public.profiles add column open_mix_pref_age_max smallint;`
   - Constraint `open_mix_pref_age_allowed`, same shape as Local: both null (Any) or both set with `18 <= min <= max <= 99`.
   - Existing rows default null (Any). No backfill.
2. Prefs writer (security definer, granted to authenticated):
   - `set_open_mix_age_prefs(p_min smallint, p_max smallint)` mirroring `set_local_age_prefs` (`not_authenticated`, `assert_account_can_write`, `invalid_age_range` on bad input).
3. Count RPC (security definer, granted to authenticated):
   - `get_open_mix_compatible_count(p_queue_key text, p_min smallint, p_max smallint) returns integer`, mirroring `get_local_compatible_count` but with `q.mode = 'open_mix'` and the caller-side `open_mix_pref_*` columns. `p_min/p_max` override lets the sheet preview a draft before saving.
   - Returns count only. No DOB, age, or pref columns in output.
4. Formation (`maybe_form_cluster`, full replace of the `0190` body):
   - Non-filtered modes (`exact_birthdate`, `birth_year_month`, `birth_year`, `generation`): byte-identical first-8 path.
   - `local` + `open_mix` branch: same greedy 8-clique as the current Local path, parameterized by `p_mode` (mode predicate uses `p_mode`, not a hardcoded `'local'`). Each waiter tried as seed in `joined_at` order.
   - Keep cron batch limits and advisory lock shape unchanged.
5. Replacement (`source_candidates`, full replace of the `0190` body):
   - Gate changes from `v_round.mode <> 'local'` to `v_round.mode not in ('local', 'open_mix')`.
   - Filtered branch replaces hardcoded `q.mode = 'local'` / `matching_mode = 'local'` with `v_round.mode`, and `cand.local_pref_*` / `mem.local_pref_*` with a mode-selected pref pair (Local columns for Local rounds, Open Mix columns for Open Mix rounds). Compatibility predicate stays `local_age_compatible` (shared math).
   - Same-queue-first then top-up shape unchanged; every candidate must be mutually compatible with all remaining members.
6. Read surface: no `get_member_profiles` change in this migration.
7. Validate: `supabase start`, `supabase db reset`, `supabase db lint --local`.

---

## 4. Frontend plan (web)

1. `src/features/matching.ts`:
   - Add `OPEN_MIX_AGE_MIN/MAX` (same 18/99 values, separate names so copy and validation read per-mode) or generalize to shared `AGE_MIN/MAX` with aliases kept for compat. Preferred: shared constants plus `LOCAL_AGE_*` aliases to minimize churn.
   - Add `useSetOpenMixAgePrefs()` mirroring `useSetLocalAgePrefs()` (invalidates `profileKey`, `my-queues`, `matching-status`, plus new `open-mix-compatible-count` key).
   - Add `useOpenMixCompatibleCount(queueKey, min, max)` mirroring `useLocalCompatibleCount` (same 60s poll, background pause, `keepPreviousData`).
   - Extend `useLocalMatchLine` into a mode-aware `useAgeMatchLine` (or add `useOpenMixMatchLine`): narrowed check for `mode in ('local','open_mix')` with the matching pref pair. Keep `useLocalMatchLine` as a thin wrapper if call sites prefer no rename churn.
   - `formatAgePrefs` is already mode-agnostic, reuse as-is.
2. `src/components/MatchPreferences.tsx`:
   - `MatchPreferencesSheet` gains a `mode: 'local' | 'open_mix'` prop selecting the save hook (`useSetLocalAgePrefs` vs `useSetOpenMixAgePrefs`), the count hook, and the sub-line ("Join the Local Radius / Open Mix queue to be grouped with 7 people who match your preferences."). Slider, Any reset, warning box, `data-e2e` attributes unchanged.
3. `src/pages/discovery/ModePanel.tsx`:
   - `JoinCard` + `JoinedCard`: extend the `mode === 'local'` prefs-row gates to `mode === 'local' || mode === 'open_mix'`, reading `local_pref_*` or `open_mix_pref_*` from `useProfile()` by mode, passing `mode` through to the sheet.
   - Update `displayBlurb` for `open_mix`: narrowed prefs get mutual copy ("grouped with 7 people who match your preferences"), Any keeps the current "whoever they are" line. Simplest: blurb takes the formatted prefs summary into account.
4. `src/lib/error.ts`: no change (`invalid_age_range` already mapped).
5. `src/lib/database.types.ts`: regen after migration, do not hand edit.
6. `src/lib/modes.ts`: update `open_mix` detail (no "no birth-date filter" wording).

---

## 5. Mobile plan

- Generated (run `cd mobile && npm run sync:db-types`, commit results): `mobile/src/lib/database.types.ts`, `mobile/src/features/matching.ts`, `mobile/src/lib/error.ts` (no-op). Verify with `--check`.
- Hand-maintained mirrors (edit in both places):
  - `mobile/src/components/discovery/ModePanel.tsx`: same gate extension as web (`JoinCard` prefs block `:146-180`, `JoinedCard` block `:241-281`), per-mode pref reads, pass `mode` to the sheet.
  - `mobile/src/components/MatchPreferencesSheet.tsx`: same `mode` prop, hook selection, and sub-line switch as web. `AgeRangeSlider` (`AGE_MIN/AGE_MAX`) reused as-is; no new slider work.
  - `mobile/src/lib/modes.ts` copy updates via the sync script transform (lucide-react-native rewrite already handled).
- `mobile/src/features/realtime.ts` is pinned; this feature adds no realtime bindings, no reconcile needed.
- Queue screens (`mobile/app/(app)/queue/[queueId].tsx`, web `QueuePage`) need no change beyond the shared `QueueProgress` counts; prefs editing stays on the mode page cards.

---

## 6. Tests

- Unit (colocated, Vitest jsdom):
  - `matching.ts`: new hooks call `set_open_mix_age_prefs` / `get_open_mix_compatible_count` with `{ p_min, p_max }` / `{ p_queue_key, p_min, p_max }` and invalidate the new count key; invalid range propagates.
  - `MatchPreferences` copy: mode prop switches sub-line (Local vs Open Mix), Any default, range label, warning appears when narrowed.
  - `ModePanel` prefs summary renders Any vs range for `open_mix` in both `JoinCard` and `JoinedCard`.
- Integration (`tests/integration/`, needs `supabase start`, fresh `supabase db reset` with no demo seed), mirroring the six Local cases:
  - 8 Any waiters on `'open'` form as today (regression: default path unchanged).
  - 8 waiters with overlapping ranges (all 25-35, ages inside) form one cluster.
  - Cross-age waiters do not merge: seven 25-35 plus one 60 seeking 55-70 stays queued.
  - One-sided mismatch does not form: A (30, seeking 25-35) plus seven 22-year-olds seeking 20-25 stays queued.
  - Replacement picks a compatible waiter and skips an incompatible longer-waiting one.
  - `get_open_mix_compatible_count` returns counts only, never DOB or prefs; direct profile update violating the CHECK fails.
  - Local suites keep passing unchanged (no shared-column coupling).
- E2E (Playwright, needs seed plus chromium):
  - Open Mix mode page: open prefs, set 25-35, see compatible count, save, join queue; `data-e2e="open-match-prefs"` reused plus a mode-specific selector if both cards render on one page.
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
9. Docs: update `docs/PRD.md` Open Mix row (global queue plus optional mutual age prefs, Any default), `docs/TECHNICAL.md` queue follow-ups line, `src/lib/modes.ts` detail. Leave `docs/archive/` plans untouched (this file is the record).

Branch from `develop` as `feature/open-mix-age-filter`, PR into `develop`. Conventional Commits. Pre-push per `AGENTS.md`. If migrations changed, also `supabase db reset` + `npm run test:integration`. If a synced web file changed, also run the sync `--check` and commit regenerated mobile copies.

---

## 8. Alternatives considered

- Reuse `local_pref_*` columns for both modes: smaller migration (no new columns, one prefs UI), but a Local 25-35 setting would silently narrow Open Mix. Rejected for surprise coupling; per-mode columns keep intent explicit.
- Generalize the count RPC to `get_compatible_count(p_mode, ...)` instead of a second function: fewer functions, but every client must pass mode and RLS review covers a wider surface. Mirrored per-mode RPCs match the `0190` shape and keep the diff reviewable.
- Rename `local_age_compatible` to `age_compatible`: cleaner name, but touches all `0190` call sites and grants for zero behavior gain. Reuse with a comment instead.

---

## 9. Explicitly out of scope

- Sex, gender, pronouns changes (pronouns stay as-is, free text, shown).
- Single-sided age ranges, preset chips beyond Any plus slider.
- Thin-pool auto-broaden, wait-time estimates, map previews.
- Changing onboarding required fields.
- Touching `birth_month` (deprecated, join-blocked) or `created` clusters (`matching_mode='open_mix'` storage sentinel, origin-filtered per `0168`).
- Suppressing `birth_year` for Open Mix members.

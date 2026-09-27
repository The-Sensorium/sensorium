# Local Radius Improvement - Implementation Plan

**Status:** Implemented (migration `0164`, segmented picker + join dialog + hardening + located country + remove location)
**Scope:** A + B + C + Option 1 only. No free slider, no distance matching.
**Goal:** Keep fixed radius buckets but make the picker better, fix the radius-change bug, harden the backend, and fix the traveler bug where profile `country_code` splits Local queues.

**Non-goals:**
- Free continuous radius values.
- PostGIS or haversine proximity matching (Option 2/3, future).
- Thin-pool auto-broaden prompt (PRD Thin Pool Handling, separate plan).
- Changing `CLUSTER_SIZE` (still 8), changing lifecycle, DMs.

---

## 1. Current state

| Area | File | Behavior today |
|---|---|---|
| Buckets | `src/pages/onboarding/draft.ts:4` | `LOCAL_RADII = [10, 50, 100]`, type `LocalRadius` union |
| Onboarding picker | `src/pages/onboarding/step-local.tsx:83` | Three fixed buttons, no counts |
| Discovery picker | `src/pages/discovery/ModePanel.tsx:324` | Same three buttons in `LocalSetupCard` |
| Onboarding submit | `src/pages/onboarding/OnboardingPage.tsx:103` | Saves `country_code`, `local_area`, `local_radius_km`, then `join_queue` with `p_radius_km` |
| Radius edit bug | `src/pages/discovery/ModePanel.tsx:267` | `changeRadius()` updates `profiles` only, does not leave and rejoin queue, so `queue_key` goes stale. `locate()` at `:232` does it correctly |
| Geo | `src/lib/geo.ts:71` | `reverseGeocode()` returns `slug + label` only, drops country. Chain: custom endpoint, then BigDataCloud, then coords fallback |
| Queue key | `supabase/migrations/0147_generation_replace_month.sql:38` (live `fn_queue_key`) | Local key is `UPPER(country_code) : local_area : radius`, using profile `country_code` |
| Join | `0147:66` (live `join_queue`, wraps `0138` rate limits + `0129` fallback) | `v_radius = coalesce(profile.local_radius_km, p_radius_km)`, no allowed-values check |
| Status RPCs | `0018`, `0034`, `0132`, `0135` `get_my_matching_status` variants | Select `country_code, local_area, local_radius_km` and call `fn_queue_key` with profile country |
| Schema | `supabase/migrations/0002_profiles.sql:8` | `country_code text`, `local_area text`, `local_radius_km integer`, no CHECK |
| Mobile mirror | `mobile/src/lib/onboarding-draft.ts`, `mobile/src/lib/geo.ts`, `mobile/src/components/onboarding/StepLocal.tsx`, `mobile/src/components/discovery/ModePanel.tsx` | Same logic, synced by script, do not hand edit |

Traveler bug example: profile `country_code = DE`, GPS in Lisbon. Key becomes `DE:lisbon:50` while locals are `PT:lisbon:50`. Same street, different queues, never match. Same issue on border metros.

---

## 2. Product decisions (locked)

| Decision | Value | Rationale |
|---|---|---|
| Buckets stay fixed | `[10, 50, 100]` | Preserves pool density. Each new value splits every local area into another 8-person pool |
| Picker control | Segmented three-button picker with labels and live counts, no slider. Radius options appear only after a location is shared (progressive disclosure); before that only the Share button shows. Tapping a new radius opens a Join confirmation dialog (area + waiting count) and confirming joins directly, no intermediate Join page. Tapping the already-queued radius opens a Leave dialog instead | Slider implies continuous choice but only 3 keys are legal. Buttons are clearer, easier on mobile and screen readers |
| Live guidance | Show `get_queue_count` per bucket in both pickers | Helps users pick the queue that actually forms. Uses existing `useQueueCount`. No Recommended badge (breaks small layouts, counts alone guide the choice) |
| Labels | Server `fn_mode_label` renders `Within 10 km of Thiruvananthapuram` (migration `0165`); client `humanizeAreaSlug` mirrors it for saved areas | Raw keys never reach the UI |
| Layout | Segmented picker stacks vertically on narrow screens, row on desktop; mobile uses single-line option rows | Three-up pills crush into circles at 390px |
| Labels | `10 km: City`, `50 km: Commute`, `100 km: Region` plus one-line helper | Short, no new colors or typefaces, tokens from `docs/DESIGN.md` only |
| Radius change semantics | Changing radius goes through the Join dialog (leave + save + join). Updating GPS leaves the old queue, saves the new area, and stays in the editor for review; joining stays explicit | Joining is never silent, except the dialog confirm itself |
| Sharing semantics | Sharing saves area + located country + coordinates only, never a default radius. User picks a radius after, then joins explicitly | Sharing must not silently queue anyone |
| Remove location | `Remove location` opens a confirmation dialog, then clears area + country + coords + radius and leaves the Local queue. Available in discovery setup card and onboarding step | Location is no longer a one-way door; formed clusters are unaffected |
| Backend source of truth | New `profiles.local_country_code`, set from reverse geocode at locate time. `fn_queue_key` uses it, never profile `country_code` | Fixes traveler case. Profile `country_code` stays for display (flag, timezone default) only |
| Radius guard | DB `CHECK (local_radius_km IN (10, 50, 100))` plus `join_queue` `invalid_radius` exception | Prevents custom clients from fragmenting pools with arbitrary values |
| Copy | Keep "exact coordinates are never shared" next to picker | Trust, already in `step-local.tsx:42` |

---

## 3. Backend plan (one migration, next number after 0163)

New file: `supabase/migrations/0164_local_radius_hardening.sql`.

1. Schema:
   - `alter table public.profiles add column local_country_code text;`
   - Backfill: `update public.profiles set local_country_code = country_code where local_area is not null and local_country_code is null;`
   - New rows default to null until first locate. Do not force not-null yet so existing users without location keep working.
   - Add check: `alter table public.profiles add constraint local_radius_allowed check (local_radius_km is null or local_radius_km in (10, 50, 100));`
2. `fn_queue_key`: keep signature `(p_mode, p_dob, p_country, p_area, p_radius)` for stability, but callers pass `local_country_code` for local mode. Update body comment to state `p_country` is located country for local, profile country is not used. Keep `open_mix -> 'open'` and generation branches unchanged.
3. `fn_mode_label`: unchanged (parses `area:radius` parts, country prefix is opaque).
4. `join_queue` (full replace, based on live `0147:66` body):
   - Keep auth, `assert_account_can_write`, dob, `mode_retired`, cooldown, `already_in_cluster_of_mode`, rate limit checks in same order.
   - Local branch: `v_radius = coalesce(profile.local_radius_km, p_radius_km)`. If `v_radius not in (10, 50, 100)` raise `invalid_radius`. If lat or area or radius null raise `location_not_set`. Backfill `local_radius_km` if null (keep `0129` behavior). `delete` existing local queue entry before insert (keep current behavior, one local queue per user).
   - Key: `fn_queue_key(p_mode, dob, profile.local_country_code, local_area, v_radius)` for local. Other modes unchanged.
   - Note: if `local_country_code` is null for legacy rows, key falls back to `''` via existing `coalesce` in `fn_queue_key`. Next locate fills it. Document this transition.
5. Status RPCs: replace `get_my_matching_status` based verbatim on the live `0135` body (scoped counts CTE with `join keys`, plus `cluster_id` column from `0034`). Changes: `me` CTE selects `dob, local_country_code, local_area, local_radius_km` (drop `country_code` here, it is unused for key math outside local); update all three `fn_queue_key` call sites (`local`, `open_mix`, `<> local`) to pass `me.local_country_code` so they stay consistent even though only the local branch reads country. Keep `drop function if exists`, return table shape, scoped `counts` join, `order by`, and re-issue `grant execute ... to authenticated` (required after drop/create). `0034_discovery_in_cluster` is dead (superseded by `0132` then `0135`), do not touch it. `get_my_queue_keys` and `get_queue_count` need no change (no key derivation, they read stored keys).
6. Grants: re-issue the `authenticated` grant on the recreated `get_my_matching_status`. `join_queue` uses `create or replace` so its grants persist, no extra grant line needed there. No new tables or functions.
7. Existing queue entries: old keys like `DE:lisbon:50` stay in `queue_entries` until users rejoin or queues drain. Options: leave to drain naturally (simplest, beta-safe) or `delete from queue_entries where mode = 'local'` in the same migration with a comment. Recommended: leave to drain, plus `locate()` and radius change migrate users on next action. Call this out in PR description.
8. Validate: `supabase db reset`, `supabase db lint --local`.

---

## 4. Frontend plan (web)

1. `src/lib/geo.ts`:
   - Extend `Place` to `{ slug, label, countryCode: string | null }`.
   - Custom endpoint: read `countryCode || country_code || country` from JSON if present.
   - BigDataCloud: read `data.countryCode` (already returned, currently ignored).
   - Coords fallback: `countryCode: null`.
   - Update `src/lib/geo.test.ts`: fallback chain, failure to BigDataCloud, coords fallback null country.
2. `src/pages/onboarding/draft.ts`:
   - Add `localCountryCode: string | null` to `OnboardingDraft` and `EMPTY_DRAFT`.
   - Keep `LOCAL_RADII` and `LocalRadius` unchanged. Keep `radiusKm: LocalRadius | null`.
   - Validation unchanged except error copy stays "Choose a matching radius."
3. `src/pages/onboarding/step-local.tsx`:
   - `locate()` stores `localCountryCode` from `reverseGeocode` alongside `coordinates, localArea, localLabel, shareLocation`.
   - Replace button row with the shared `RadiusPicker` segmented control (labels + live counts). Tapping a bucket opens a Join confirmation dialog (area + waiting count); confirming saves the radius and joins directly. Key format for counts must mirror `fn_queue_key` exactly: `UPPER(localCountryCode or '') + ':' + slug + ':' + radius`, so counts hit the same queue `join_queue` will write.
   - Keep Tailwind tokens only, min touch target 44px, `data-e2e` attributes for Playwright.
4. `src/pages/onboarding/OnboardingPage.tsx`:
   - Upsert adds `local_country_code: draft.localCountryCode`.
   - Join loop unchanged (`p_radius_km` still passed, backend now validates).
   - Add `invalid_radius` to `joinQueueErrorMessage` mapping in `src/lib/error.ts` if missing.
5. `src/pages/discovery/ModePanel.tsx` (`LocalSetupCard` + `JoinCard`):
   - `locate()` saves `local_area, local_radius_km, local_country_code, lat/lng` together, leaves local queue first (keep existing), invalidates `profileKey`, `my-queues`, `matching-status`.
   - Replace `changeRadius(next)` with `migrateRadius(next)`: set state optimistically, update profile fields, then `leave_queue('local')` + `join_queue('local', next)` via `useJoinQueue`, invalidate same keys, surface errors. Do not leave profile and queue out of sync.
   - Same segmented picker + per-bucket `useQueueCount` display as onboarding, plus Join dialog and Remove-location dialog. Show the human `label` (not raw `queue_key`) on Join/Joined cards and the queue page.
   - `JoinCard` already passes `profile.local_radius_km`; no change except error copy for `invalid_radius`.
6. `src/lib/database.types.ts`: regen from schema after migration, do not hand edit. Mobile copies via sync script (below).

---

## 5. Mobile plan

Synced files via `mobile/scripts/sync-db-types.mjs` (regen + `--check` in CI): `database.types.ts`, `lib/geo.ts` (RN adapted), `lib/modes.ts`, `lib/error.ts`, `features/matching.ts`. Hand-maintained mirrors (not covered by the script, edit in both places): `mobile/src/components/onboarding/StepLocal.tsx` (picker + counts, `expo-location` permission flow stays) and `mobile/src/components/discovery/ModePanel.tsx` (locate + dialog-join + remove logic), plus `mobile/src/lib/onboarding-draft.ts` (new `localCountryCode` field).

---

## 6. Tests

- Unit (colocated, Vitest jsdom):
  - `geo.test.ts`: BigDataCloud country parsing, custom endpoint country, fallback null.
  - `draft.test.ts`: new field defaults, step 4/5 validation still requires radius.
   - `RadiusPicker` test: pressed states, counts, nothing pressed when null.
  - `ModePanel` test: radius migrate calls leave then join, error path restores.
- Integration (`tests/integration/matching.test.ts`, needs `supabase start`):
  - Join local with 10/50/100 succeeds, key is `LOCAL_COUNTRY:area:radius`.
  - Join with 25 or 999 raises `invalid_radius`.
  - Traveler: profile `country_code = DE`, `local_country_code = PT`, same area and radius as PT local joins same queue and forms at 8.
  - Legacy null `local_country_code` still joins (empty prefix path), next locate fills it.
  - Direct `profiles` insert with 25 violates CHECK.
- E2E (Playwright, needs seed + chromium):
   - Onboarding local step picker selects 50km, review shows "Within 50 km of ...".
   - Discovery local page shows counts per bucket.
- Coverage gate (`npm run test:coverage`, lines 34 percent, functions 33 percent, branches 20 percent in `vite.config.ts`) must not regress. Never lower thresholds.

---

## 7. Rollout and verification

1. `supabase start`, then `supabase db reset`, rerun `npm run seed:demo`.
2. `supabase db lint --local`.
3. `npm run lint`.
4. `npm run test:coverage`.
5. `npm run build` (runs `tsc -b` + `vite build`).
6. `npm run test:integration`.
7. `node mobile/scripts/sync-db-types.mjs --check`, commit regenerated mobile copies.
8. `npm run test:e2e` if queue UI changed (config starts Vite itself, needs `npx playwright install chromium`).
9. Docs: update `docs/PRD.md` Local row + constraint note (one radius, located country), `docs/TECHNICAL.md` queue follow-ups line if needed. Keep `docs/archive/` untouched (shipped records only).

Branch from `develop` as `feature/local-radius-picker`, PR into `develop`. Conventional Commits. Pre-push per `AGENTS.md`.

---

## 8. Risks

- Stranded old keys: users already queued under `PROFILE_COUNTRY:area:radius` will sit in a different queue than newcomers under `LOCAL_COUNTRY:area:radius` until they rejoin. Mitigation: drain naturally, migrate on next locate or radius change, call out in release notes. Optional one-line cleanup in migration if product accepts kicking local queues.
- BigDataCloud country missing or wrong near borders: fallback is null country, key still forms (empty prefix), just less disambiguated. Acceptable, next locate with better fix corrects it.
- Slug collisions across countries with null country: same as today, no worse. Full fix needs distance matching (out of scope).
- Scope creep into free slider: reject. Any value outside the three must fail closed with `invalid_radius`.

---

## 9. Explicitly out of scope

- Continuous slider values, custom km input.
- `fn_queue_key` keyed only on area, or haversine grouping.
- Auto-broaden prompt, wait-time estimates from history, map circle preview (nice follow-ups, separate plans).
- Changing onboarding required fields (country stays required for identity).

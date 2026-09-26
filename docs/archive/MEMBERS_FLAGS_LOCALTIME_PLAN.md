# Members List: Proper Flags + Local Time - Implementation Plan

Status: implemented (pending CI: `supabase db lint`, integration tests, seed demo)
Verified locally: web lint, mobile lint, web unit 847 passed, mobile unit 60
passed, coverage gate passed, `npm run build` passed, mobile `tsc --noEmit`
passed, mobile sync `--check` passed. Docker is unavailable in this
environment, so `supabase start`, `supabase db reset`,
`npm run test:integration`, and `npm run seed:demo` must run in CI.
Goal: match the mockup on the cluster Members list. Each member card shows
`flag + country name | birth year | local time`, with no emoji flags.
Timezone is per user, editable in onboarding and Settings.

## 1. Decisions

### 1.1 Flags, web (React 19 + Vite)

Package: `country-flag-icons` (catamphetamine).
Why: 3.2M weekly downloads, updated July 2026, MIT, tree-shakeable React SVG
components at about 1KB per flag, works with Vite. No emoji, so no Windows
rendering problem.

Usage:

```tsx
import { US } from 'country-flag-icons/react/3x2'
<US title="United States" className="h-4 w-6 rounded-sm" />
```

Dynamic codes from the API go through one wrapper (see 4.1), using `hasFlag()`
with a graceful fallback for unknown codes (e.g. `XK` Kosovo is supported).
Tradeoff: the wrapper looks flags up via a namespace import, so the bundler
includes every flag (about 200 small SVGs, measured 57KB gzip on the
MembersView chunk) rather than tree-shaking per code. Accepted for the
runtime-dynamic member list; revisit with per-code lazy imports only if the
chunk budget bites.

Alternative considered: `flag-icons` (lipis) CSS classes. Rejected because the
React-component API fits this codebase better.

### 1.2 Flags, mobile (Expo 57, RN 0.86)

Package: `react-native-country-flag-icons` (jun-jaehyuk-lee).
Why: tree-shakeable SVG at about 1KB per flag, TypeScript with `CountryCode`
type, Expo compatible. Alternatives are worse: `react-native-country-flag`
(last updated 2023, remote-fetch model), `react-native-ico-flags` (about 358KB
bundle, no tree-shaking), `react-native-svg-flagkit` (PNG based, huge).

This repo already has `react-native-svg@15.15.4` and `expo-dev-client`, which
is exactly what the package needs. No native config change expected.

### 1.3 Timezone model

- Store IANA timezone string on `profiles.timezone` (nullable `text`), e.g.
  `America/New_York`, `Asia/Kolkata`.
- Country code alone is not sufficient (US spans 4+ zones; the mockup itself
  shows US members at different times), so timezone is captured per user.
- Display with built-in `Intl.DateTimeFormat` only. No date library needed.
- Timezone list bundled as a static 421-entry constant in `timezones.ts`
  (generated from `Intl.supportedValuesOf` plus canonical aliases). Engine
  ICU data differs (desktop Chrome returns the full set, Hermes on mobile a
  subset), so a bundled list is the only way web and mobile show identical
  values. No new dependency.
- `null` means unknown: hide the clock segment. Existing users get `null`
  until they set it in Settings.

## 2. Database (strict migration rules apply)

Next file: `supabase/migrations/0161_profile_timezone.sql` (last applied is
`0160`). Never edit an applied migration; add a new one.

Migration contents:

1. `alter table public.profiles add column timezone text;`
2. Optional guard: `check (timezone is null or char_length(timezone) <= 64)`.
   Validate IANA shape client side; DB keeps a light length check only.
3. Redefine `get_member_profiles(p_cluster_id uuid)` to add `timezone text`
   to the returns table and select `p.timezone`. Keep the members-only guard
   and avatar/bio masking unchanged. Keep `grant execute ... to authenticated`.
4. `supabase db lint --local` must pass.

Follow-ups after migration:

- Regenerate `src/lib/database.types.ts` from schema (no codegen script in
  `package.json`; generate against local stack) and keep in sync.
- Run `node mobile/scripts/sync-db-types.mjs` and commit regenerated mobile
  copies (`mobile/src/lib/database.types.ts`, shared `src/lib` / `src/features`
  copies). Run with `--check` in verification.
- RLS: no policy change needed. `profiles` self read/update already covers the
  new column; member visibility flows through the `security definer` RPC guard.

## 3. Shared lib and data plumbing

- `src/features/matching.ts` (`useClusterMembers`): no logic change; the new
  `timezone` field flows through `get_member_profiles` typing automatically
  after regen. Same for `mobile/src/features/matching.ts` via sync.
- `src/features/cluster.ts` `ProfilePatch` (line ~444): add
  `timezone?: string | null` so Settings can save via existing RLS self update.
  Synced mobile copy: `mobile/src/features/cluster.ts`.
- New `src/lib/timezones.ts` (shared, synced to mobile):
  - `isValidTimeZone(tz: string): boolean` via try/catch around
    `Intl.DateTimeFormat(undefined, { timeZone: tz })`.
  - `timeZoneList(): string[]` via `Intl.supportedValuesOf('timeZone')` with a
    small curated fallback for engines without it.
  - `formatMemberTime(date: Date, tz: string): string`, e.g. `h:mm AM`.
  - `defaultTimeZone(): string | null` via
    `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- No new colors, typefaces, or radii. No em dashes or en dashes in copy or
  comments. Components never talk to Supabase directly; go through feature
  hooks.

## 4. Members list UI

Target row segment (web + mobile):

```text
[flag] United States | [cake] 1975 | [clock] 7:06 AM
```

### 4.1 Web

- New `src/components/CountryFlag.tsx`: props `{ code: string, className?: string }`.
  Maps uppercased code to `country-flag-icons/react/3x2` component, checks
  `hasFlag()`, renders nothing (or a neutral placeholder) for unknown codes.
  Decorative when next to visible country name (`aria-hidden`, since the name
  is the accessible label).
- New `src/components/MemberLocalTime.tsx`: props `{ timeZone: string | null }`.
  Returns null when null/invalid. Otherwise formats `now` with
  `Intl.DateTimeFormat` and refreshes on a 60s interval (aligned to minute
  boundary), plus `Clock` lucide icon to match the mockup.
- Edit `src/pages/cluster/MembersView.tsx:103-118`: replace `MapPin` with
  `<CountryFlag>`, keep `countryName()` text, keep `Cake + birth_year`, append
  `| <MemberLocalTime>` when `member.timezone` is present. Keep truncate and
  `gap-x-3` layout.
- Tests colocated: `CountryFlag.test.tsx`, `MemberLocalTime.test.tsx` (fake
  timers), extend `MembersView.test.tsx` (flag renders, time renders when
  timezone set, hidden when null).

### 4.2 Mobile

- New `mobile/src/components/CountryFlag.tsx` using
  `react-native-country-flag-icons` named imports (tree-shaking) behind the
  same `{ code }` prop API.
- New `mobile/src/components/MemberLocalTime.tsx` with the same behavior using
  the synced `src/lib/timezones.ts`.
- Edit `mobile/app/(app)/cluster/[clusterId]/members.tsx:136-155`: replace
  `MapPin` with `CountryFlag`, keep `countryName()`, keep `Cake`, append local
  time with the same separators. Mirror on profile screens only if in scope;
  default is members list only.
- Note: `mobile/src/features/realtime.ts` is pinned and reconciled by hand;
  no change expected here.

## 5. Onboarding (ask for timezone)

### 5.1 Web

- `src/pages/onboarding/draft.ts`: add `timezone: string` to
  `OnboardingDraft` and `EMPTY_DRAFT` (default `''`, prefilled at mount from
  `defaultTimeZone()`).
- `src/pages/onboarding/step-profile.tsx`: add Timezone labelled select after
  Country, populated from `timeZoneList()`, showing detected default hint
  (e.g. "Detected: Asia/Kolkata"). Invalid selection blocked by
  `isValidTimeZone()`.
- `src/pages/onboarding/draft.ts` `validateStep(1)`: require non-empty valid
  timezone with message "Please select your timezone."
- `src/pages/onboarding/OnboardingPage.tsx:90-108`: include
  `timezone: draft.timezone` in the profiles upsert.
- `src/pages/onboarding/step-review.tsx`: show timezone in review summary.
- Tests: extend `draft.test.ts`, `OnboardingPage.test.tsx`.

### 5.2 Mobile

- `mobile/src/lib/onboarding-draft.ts`: same `timezone` field + validation.
- `mobile/src/components/onboarding/StepProfile.tsx`: same select. On RN use a
  picker compatible with the existing form controls; Hermes `Intl` covers
  `supportedValuesOf` on modern builds, otherwise use the curated fallback
  list from `timezones.ts`.
- `mobile/app/(onboarding)/index.tsx:102-118`: include `timezone` in upsert.
- Prefill from device via `defaultTimeZone()`. Only add `expo-localization`
  if device testing shows Hermes `Intl` detection is unreliable; default is no
  new native dependency.

## 6. Settings (change timezone later)

### 6.1 Web (`src/pages/SettingsPage.tsx`)

- New "Local time" section (after Status): timezone select bound to
  `profile.data?.timezone`, save via `useUpdateProfile().mutateAsync({ timezone })`,
  same dirty-check and error-copy pattern as Display name/Status sections.
- Extend `SettingsPage.test.tsx`.

### 6.2 Mobile (`mobile/app/(app)/settings.tsx`)

- Same "Local time" card after the status card, using native picker +
  `useUpdateProfile` from `mobile/src/features/cluster.ts`.
- Confirm backfill behavior: existing users see detected timezone as the
  suggested value but nothing is saved until they confirm.

## 7. Seed and demo

- `scripts/seed-demo.mjs`: add per-member `timezone` values matching their
  `country_code` (e.g. US members across distinct zones to mirror the mockup)
  so `npm run seed:demo` shows flags + varied local times out of the box.

## 8. Verification

- `npm run lint` (web + `mobile` lint).
- `npm test` then `npm run test:coverage`: hard v8 gate (lines 34%, functions
  33%, branches 20%). Never lower thresholds.
- `npm run build` (typecheck + vite build).
- Migrations changed, so: `supabase db reset` + `npm run test:integration`
  (requires `supabase start`). Add/extend an integration test asserting
  `get_member_profiles` exposes `timezone` to members and hides it from
  outsiders.
- `node mobile/scripts/sync-db-types.mjs --check` when synced files change.
- E2E only if touching flows covered there: `supabase start` +
  `npm run seed:demo` + `npx playwright install chromium`, tests select by
  `data-e2e`. Add `data-e2e` hooks for the timezone select if e2e covers
  onboarding/settings.
- Realtime: no realtime migration change, so no `supabase stop/start` needed.
- Manual: web (Chrome, Windows check since flag emoji was rejected for this
  reason), mobile Expo dev client iOS + Android, offline flag render, null
  timezone hides clock, minute rollover updates.

## 9. Rollout order

1. Migration `0161` + regen types + mobile sync + integration test.
2. Shared `timezones.ts` + `ProfilePatch.timezone`.
3. Web `CountryFlag` + `MemberLocalTime` + `MembersView` + tests.
4. Web onboarding + settings + seed demo + tests.
5. Mobile flags/time/members + onboarding/settings + tests.
6. Full gates per AGENTS.md pre-push rules.

## 10. Out of scope

- Deriving timezone from `latitude/longitude` or `country_code` automatically.
- Showing seconds, weekday, or GMT offsets in the member row.
- Editing another member's timezone; staff/admin surfaces stay web-only and
  unchanged.

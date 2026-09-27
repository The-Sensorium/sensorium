# Member Profile Detail Update - Implementation Plan

Status: implemented.
Verified: `npm run lint` (0 errors), `npm test` (103 files, 896 tests passed), `npm run test:coverage` (gate passed), `npm run build` (typecheck + Vite build passed), mobile `tsc --noEmit` passed, mobile sync `--check` passed.
Goal: update the member profile detail page to match the mockup. Add a Sun/Moon time-of-day icon derived from the member's local time, restructure cards into Header / About / Introductions / Bottom order, show full bio with large quotes, and show birth year and cluster name in the bottom card. No other visual changes.

Scope: web (`src/pages/ProfilePage.tsx`, `src/components/MemberLocalTime.tsx`) plus mobile parity (`mobile/app/(app)/profile/[userId].tsx`, `mobile/src/components/MemberLocalTime.tsx`). The mockup shows the mobile dark theme, but web and mobile share the same backend and section order, so both stay in sync per `mobile/README.md`. `MemberLocalTime` is shared, so the icon change also applies to the cluster member lists (`MembersView.tsx`, mobile `members.tsx`), which is intended for consistency.

No migration needed. No RLS or RPC change. No new fonts, spacing, or radii. No em dashes or en dashes in copy or comments.

Implementation notes that differ from the plan as drafted:
- The Sun/Moon icon uses an amber fill (web `text-amber-500 dark:text-amber-400`; mobile `#f59e0b` / `#fbbf24`) rather than `text-primary`, a deliberate product decision to make the time-of-day cue read naturally. Amber is shared with the "busy" availability dot; accepted tradeoff since the icon sits inline with the clock text, far from the status badge.
- Icon size is 16px on web (`h-4 w-4`) and `fontSize + 2` on mobile, slightly larger than the 14px time text. Kept on the left of the time value to stay anchored and match the leading-icon pattern of the other meta rows.
- `ProfilePage.test.tsx` was added covering section order, full-bio rendering without the clamp, status without a heading, and birth year and cluster name placement.
- Age display was dropped during review: the bottom card shows the year and cluster name only, both in grey. Age math is year-only anyway since `get_member_profiles` exposes just the birth year.

## 1. Current state

- Web profile: `src/pages/ProfilePage.tsx:81-395` (`MemberProfile`). Single header card holds avatar, name (`PronounBadge`), country + `MemberLocalTime` + birth year meta row (`:157-188`), online/offline badge (`:189-198`), Status label + About label with `line-clamp-3` bio and Show more/less toggle (`:202-235`), cluster footer (`:240-252`), Message + Mute + Report actions (`:254-287`). Introductions section follows (`:297-340`), then Posts (`:342-392`).
- Web time: `src/components/MemberLocalTime.tsx:9-32`. Returns null for missing or invalid zone. Renders `Clock` icon (`h-3 w-3`) plus `formatMemberTime(now, tz)` (`src/lib/timezones.ts:453-460`, `h:mm AM/PM`). Ticks on the minute boundary.
- Mobile profile: `mobile/app/(app)/profile/[userId].tsx:117-281` (header card with same Status label + clamped bio), Introductions card (`:290-341`), Posts (`:343-365`). Time component: `mobile/src/components/MemberLocalTime.tsx:11-44` (Clock icon, `fontSize` prop).
- Tests: `src/components/MemberLocalTime.test.tsx:5-20`. No dedicated `ProfilePage.test.tsx` exists.
- Tokens: `docs/DESIGN.md`. Primary token is `text-primary` on web and `t.primary` on mobile. Icons use `strokeWidth={1.5}`.

## 2. Time-of-day icon

### 2.1 Helper (shared, synced)

Add to `src/lib/timezones.ts` (shared file copied to mobile by `mobile/scripts/sync-db-types.mjs`):

```ts
export function getMemberHour(now: Date, tz: string): number | null
```

- Implementation: `new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(now)`, parse the leading hour int. Handle `24` midnight edge as `0`. Return `null` on invalid zone (try/catch, reuse `isValidTimeZone`).
- Add `isMemberDaytime(now: Date, tz: string): boolean | null`: returns `null` when hour is `null`, else `hour >= 6 && hour < 20`. Day is 6am to 8pm, night is 8pm to 6am. Boundary rule: exactly 6:00 AM is day, exactly 8:00 PM is night.
- Critical: derive from the member's `timezone` prop, never from viewer locale or device zone. `formatMemberTime` already does this; the new helper follows the same pattern.

### 2.2 Web `MemberLocalTime.tsx`

- Replace `Clock` import with `Sun, Moon` from `lucide-react`.
- Compute `isDay = isMemberDaytime(new Date(), timeZone)` on each render (component already re-renders each minute via the tick timer, so the icon flips without extra timers).
- Render: `<Sun>` when day, `<Moon>` when night. Both with `className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400"`, `strokeWidth={1.5}`, `fill="currentColor"`, `aria-hidden`. Keep outer span `inline-flex items-center gap-1`. Size is slightly larger than the adjacent `text-sm` time text and stays inline on the left of the time.
- Keep null return for missing or invalid zone. Keep minute-boundary refresh logic unchanged.
- Accessibility: icon is decorative (`aria-hidden`); the existing `sr-only` "Local time: " prefix in `ProfilePage.tsx` stays.

### 2.3 Mobile `MemberLocalTime.tsx`

- Same logic using `lucide-react-native` `Sun, Moon`. Props: `{ timeZone, fontSize = 12 }`. Icon `size={fontSize + 2}` (slightly larger than text, inline on the left), `color={amber}` and `fill={amber}` where `amber` is `#f59e0b` light / `#fbbf24` dark (theme-aware via `useResolvedScheme`, matching the busy-dot values), `strokeWidth={1.5}`.
- Keep row layout (`flexDirection: row, alignItems: center, gap: 4`) and minute tick timer unchanged. Null for missing or invalid zone.

## 3. Page restructure

Target order, both platforms:

1. Header card
2. About/Bio card
3. Introductions card (unchanged)
4. Bottom card
5. Posts (unchanged, keep existing position after Introductions/Bottom)

### 3.1 Header card

Contents: avatar, name, pronouns badge, country row, local time plus Sun/Moon icon, online/offline badge, status message as italic text below a divider.

Web edits (`src/pages/ProfilePage.tsx`):

- Meta row (`:157-188`): keep country flag plus name and `MemberLocalTime` (now with icon). Remove the birth year segment and its `Cake` import usage here, plus the `·` separators tied to it. Birth year moves to the bottom card.
- Online/offline row (`:189-198`): no change.
- Status/bio block (`:202-235`): split. Keep only `member.current_status` here. Render below the existing `border-t` divider as plain italic text with no "Status" label heading, matching the mockup: `<p className="text-sm italic text-on-surface-variant"><LinkifiedText ... /></p>`. If no status, render no divider block (avoid an empty divider).
- Remove `bioExpanded` state, its reset `useEffect`, and the `cn` line-clamp toggle (bio moves to its own card). Remove unused `useEffect`, `useState` for bio if nothing else uses it. Keep `reportOpen` state.
- Keep `Avatar`, `PronounBadge`, `CountryFlag`, `AvailabilityBadge` usage and all card classes (`rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft md:p-5`) unchanged.

Mobile edits (`mobile/app/(app)/profile/[userId].tsx:117-203`):

- Same split: header card keeps country plus time, online/offline, and status-only italic `LinkifiedText` below the divider. Remove the "Status" label `Text` and the bio block from this card.
- Remove `bioExpanded` state and toggle.

### 3.2 About/Bio card (new)

Web: new `<section aria-label="About">` between header and Introductions, same card classes as Introductions (`rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft`):

```tsx
{member.bio ? (
  <section aria-label="About" className="...same card...">
    <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">About</h2>
    <div className="mt-2 flex gap-2">
      <span aria-hidden className="text-2xl leading-none text-on-surface-variant/60">“</span>
      <p className="flex-1 text-sm leading-5 text-on-surface"><LinkifiedText text={member.bio} /></p>
      <span aria-hidden className="self-end text-2xl leading-none text-on-surface-variant/60">”</span>
    </div>
  </section>
) : null}
```

- Full bio text, no `line-clamp`, no Show more/less button.
- Large opening and closing quote marks as plain text characters styled with existing tokens only (`text-on-surface-variant/60`, no new color or font). Decorative (`aria-hidden`) so screen readers read the bio once.
- Render nothing when `member.bio` is empty. No divider or empty card.

Mobile: new `Card` between header and Introductions with the same rule: `ABOUT` label (`fontSize 12, primary, uppercase`), row with large `“` / `”` `Text` (`fontSize 24, t.onSurfaceVariant, opacity 0.6`), full `LinkifiedText` bio, no `numberOfLines`, no toggle.

### 3.3 Introductions card

No changes on web (`:297-340`) or mobile (`:290-341`). Keep heading, loading, empty, and answer list exactly as is.

### 3.4 Bottom card (new)

Combine birth/age, cluster, and actions into one card. Mockup order: BORN row, CLUSTER row, primary Message button, Mute plus Report row.

Web: new `<section aria-label="Details">` (or plain `div` card) after Introductions, same card classes:

- Born row: `BORN` label (`text-xs font-semibold uppercase tracking-wide text-primary`), `Cake` icon on the left, then the year alone in `text-on-surface-variant`. No "Born" prefix (the label already says it), no age. Guard: render row only when `birth_year` is present.
- Cluster row: `CLUSTER` label, `Users` icon on the left, then the cluster name alone in `text-on-surface-variant`. No member count. `border-t border-outline-variant/40` divider separates the rows; the action button below has no divider.
- Actions: move existing Message link plus Mute/Report grid (including `isSelf` Edit profile branch) into this card unchanged (classes, `min-h-[48px]`, pill radii, `MuteButton fullWidth`, Report modal trigger).
- If `!cluster && isSelf`, card still renders born plus Edit profile; if neither born nor cluster nor actions apply, render nothing.

Mobile: same structure with `Card`, `Text`, `View` styles mirroring existing born (`:205-217`) and cluster (`:219-233`) blocks plus action block (`:235-280`). Add age text next to `birth_year` (`{birth_year} · {age} years old`).

## 4. Tests

Colocated with source per conventions:

- Extend `src/components/MemberLocalTime.test.tsx`: mock `Date` or pass fixed instants. Cases: 6:00 AM member time renders Sun, 7:59 PM renders Sun, 8:00 PM renders Moon, 5:59 AM renders Moon, invalid zone renders nothing. Assert icon by lucide class plus the amber token class, and that time text still matches `/\d{1,2}:\d{2} (AM|PM)/`. Same cases for `getMemberHour` / `isMemberDaytime` in `src/lib/timezones.test.ts`.
- New `src/pages/ProfilePage.test.tsx` (added): mocks `useClusterMembers`, `useMemberIntroAnswers`, `useIntroQuestionMap`, `useMyClusters`, `useAuth`, `usePresence`, `useUserPosts`, `usePostCountsForClusters`, `useAvatarUrl`, `ReportModal`, `MuteButton`. Asserts section order (About, Introductions, Details), full bio present with no `line-clamp-3` or Show more button, status rendered without a Status heading, birth year and cluster name in the bottom Details card, and Message/Report vs Edit profile for other/self views.
- Mobile: mirror `MemberLocalTime` cases in `mobile/src/components/MemberLocalTime.test.tsx` if the runner exists; otherwise at least web coverage plus manual Expo check.
- Coverage gate (`vite.config.ts`: lines 34 percent, functions 33 percent, branches 20 percent) must still pass. Never lower thresholds.

## 5. Verification

1. `npm run lint` (plus mobile lint if touched).
2. `npm test <touched-file>` then full `npm test`, then `npm run test:coverage` (hard gate).
3. `npm run build` (typecheck plus Vite build).
4. If a synced web file changed (`src/lib/timezones.ts` is shared), run `node mobile/scripts/sync-db-types.mjs --check` and commit regenerated mobile copies. Do not hand-edit generated mobile copies.
5. No migration, so no `supabase db reset` or integration run required. No realtime migration change, so no `supabase stop/start` needed.
6. E2E only if adding `data-e2e` hooks: config starts Vite itself (`supabase start` plus `npm run seed:demo` plus `npx playwright install chromium`). Add `data-e2e="profile-about"` and `data-e2e="profile-details"` only if the team wants selectors.
7. Manual: member in day zone shows amber Sun inline with time; member in night zone shows amber Moon; boundary 6am day and 8pm night; invalid or missing zone hides time; bio shows full text with large quotes and no toggle; born plus age math correct; light and dark themes render the amber correctly; web Chrome plus Expo iOS and Android.

## 6. Rollout order

1. Shared `getMemberHour` plus `isMemberDaytime` in `src/lib/timezones.ts` plus unit tests.
2. Web `MemberLocalTime` Sun/Moon swap plus tests.
3. Web `ProfilePage` header split, About card, Bottom card, remove bio toggle, plus `ProfilePage.test.tsx`.
4. Mobile `MemberLocalTime` plus `profile/[userId].tsx` parity.
5. Mobile sync check, full gates per `AGENTS.md` pre-push rules (`lint`, `test:coverage`, `build`).

## 7. Out of scope

- Changing colors, fonts, spacing, card styles, or theme tokens.
- Touching Introductions content or Posts layout.
- Timezone editing, migration, RLS, or notification changes.
- Staff or admin surfaces (web-only, unchanged).

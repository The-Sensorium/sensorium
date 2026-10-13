# Cluster Back Navigation Plan: stop hardware back exiting the app

## Goal

Fix the intermittent "press back inside cluster chat and land on the phone home screen (app closed)" report.

Target state: hardware back from any cluster route never finishes the Activity when there is a sensible in-app parent. It walks the visit trail when one exists, and falls back to an explicit parent (room, then home) when the screen was entered with no history (push tap cold start, deep link).

## Non-goals

- No change to tab bar visibility, tab layout, or `backBehavior` value.
- No change to push payloads, notification routing targets, or server behavior.
- No new native module or back-pressure library. Use the documented `BackHandler` + `expo-router` pattern already in the codebase.
- No migration, no RLS change, no `database.types.ts` regen.

## Current state (verified)

- Tabs layout: `mobile/app/(app)/_layout.tsx:85-95` uses `backBehavior="history"`. All cluster screens are hidden tab routes (`href: null`, `tabBarStyle: display none`), `mobile/app/(app)/_layout.tsx:151-172`.
- Room intercepts back: `mobile/app/(app)/cluster/[clusterId]/room.tsx:210-227` registers `BackHandler` in `useFocusEffect`, closes panels/keyboard first, else `router.replace('/(app)/home')` and returns `true`. UI back in `room.tsx:1014-1030` does the same replace. Room back is deterministic and is not the bug.
- Inner screens have no `BackHandler` and mostly no UI back:
  - `members.tsx:65-66`, `signals.tsx:93-94`, `votes.tsx:157-168`, `settings.tsx:65-66`, `meetups.tsx:68-69` render only `ClusterSectionHeader` (title + `ClusterMenu`), no back affordance. Navigation between sections is `router.push`, `mobile/src/components/ClusterMenu.tsx:90-93`.
  - `signals/[signalId].tsx:241-245` has UI back with fallback (`canGoBack() back() else replace signals`), but no hardware handler.
  - `appearance.tsx:71-74` has `goBackToRoom()` helper with the same fallback, wired only to Apply, not to hardware back.
  - `profile/[userId].tsx:118-128` links back to members, no hardware handler.
  - `meetups/new.tsx:394` UI Back does bare `router.back()` with no fallback.
- Push entry with no history: `mobile/app/(app)/_layout.tsx:30-48` `handlePushTap` does `router.push(pushDataToHref(...))`. Targets in `mobile/src/lib/notification-routing.ts:32-63` include `room`, `signals`, `signals/[signalId]`, `votes`, `meetups`, `profile`. A cold-start push is a single-entry stack, so system back has nowhere to go and Android closes the app. This is why only some users see it.
- Sheets/modals already consume back correctly and must keep priority: `MessageActionsSheet.tsx:49-56`, `MessageInfoModal.tsx:77-84` (return `true`). `BackHandler` dispatches LIFO, so screen-level handlers registered earlier lose to these as long as we do not break ordering.
- Known router quirk documented in `call.tsx:72-85`: `router.replace` on a tab route maps to `JUMP_TO` and leaves the route in the history trail, so `router.back()` is the correct exit there. Do not "fix" the call screen exit path.

## Decisions

### 1. One shared hook, per-screen fallback

Add `mobile/src/lib/use-cluster-back.ts`:

```ts
export function useClusterBack(fallback: Href): () => void
```

- Registers `BackHandler` in `useFocusEffect`.
- Handler: `if (router.canGoBack()) router.back(); else router.replace(fallback); return true`.
- Returns a `goBack` callback with identical logic for UI back buttons, so hardware and UI back never diverge.
- No timers, no polling, no `setTimeout` (per AGENTS.md fix quality).

Fallback table (shallowest sensible parent, never OS home):

| Screen | Fallback |
|---|---|
| `cluster/[clusterId]/members` | room for same `clusterId` |
| `cluster/[clusterId]/signals` | room for same `clusterId` |
| `cluster/[clusterId]/signals/[signalId]` | signals list for same `clusterId` |
| `cluster/[clusterId]/votes` | room for same `clusterId` |
| `cluster/[clusterId]/meetups` | room for same `clusterId` |
| `cluster/[clusterId]/meetups/new` | meetups for same `clusterId` |
| `cluster/[clusterId]/appearance` | room for same `clusterId` |
| `cluster/[clusterId]/settings` | room for same `clusterId` |
| `cluster/[clusterId]/introductions` | room for same `clusterId` (already replaces to room; hook only covers abnormal back) |
| `cluster/[clusterId]/waiting` | room for same `clusterId` |
| `profile/[userId]` (with `cluster` param) | members for that `clusterId`, else `/(app)/home` |
| `room` | unchanged: panels/keyboard first, then `replace home` |

Why `router.back()` first: preserves the normal `home -> room -> members` trail and cross-screen trails like `room -> signals -> signal detail`. The fallback only fires on empty/single-entry stacks (push cold start, deep link).

### 2. Keep room and call screens as is

- Room keeps its existing handler (panels/keyboard, then replace home). Do not route it through the new hook; its exit is intentionally deterministic, not history-based.
- Call keeps `exitToRoom()` via `router.back()` (`call.tsx:81-85`). Do not add a fallback replace there; the comment explains why replace would strand the dead call route in history.

### 3. UI back buttons: wire to the same callback, add where missing

- `signals/[signalId].tsx` and `appearance.tsx`: replace inline `canGoBack` logic with the hook's `goBack`. No behavior change, removes duplication.
- `meetups/new.tsx:394`: wire `SecondaryButton Back` to `goBack` (adds the missing fallback to meetups).
- `members`, `signals`, `votes`, `settings`, `meetups` list screens: no new visible back arrow (they are top-level cluster sections reached via `ClusterMenu`; adding arrows would duplicate the menu and diverge from design). Hardware back via the hook is the fix there. `profile/[userId]` already has "Back to members" link; keep it, hardware hook mirrors it.
- No new colors, typefaces, or radii. No copy changes except reusing existing labels if a button is touched.

### 4. Do not change push routing targets

`pushDataToHref` targets stay the same. The hook makes every target back-safe, which covers both push taps and notification-list taps without touching `handlePushTap` or server payloads.

## Client changes (files)

1. New `mobile/src/lib/use-cluster-back.ts` + colocated `use-cluster-back.test.ts` (mock `expo-router` router + `BackHandler`; assert back-when-possible, replace-when-not, returns `true`, cleanup removes listener).
2. Apply `useClusterBack` in:
   - `mobile/app/(app)/cluster/[clusterId]/members.tsx`
   - `mobile/app/(app)/cluster/[clusterId]/signals.tsx`
   - `mobile/app/(app)/cluster/[clusterId]/signals/[signalId].tsx` (also swap UI back to `goBack`)
   - `mobile/app/(app)/cluster/[clusterId]/votes.tsx`
   - `mobile/app/(app)/cluster/[clusterId]/meetups.tsx`
   - `mobile/app/(app)/cluster/[clusterId]/meetups/new.tsx` (also swap UI Back to `goBack`)
   - `mobile/app/(app)/cluster/[clusterId]/appearance.tsx` (swap `goBackToRoom` to `goBack`)
   - `mobile/app/(app)/cluster/[clusterId]/settings.tsx`
   - `mobile/app/(app)/cluster/[clusterId]/introductions.tsx`
   - `mobile/app/(app)/cluster/[clusterId]/waiting.tsx`
   - `mobile/app/(app)/profile/[userId].tsx` (fallback: members when `cluster` param present, else home)
3. Explicitly untouched: `room.tsx` back handler, `call.tsx` `exitToRoom`, `(app)/_layout.tsx` tabs config, `notification-routing.ts`, `ClusterMenu.tsx`.
4. `mobile/CHANGELOG.md`: entry under `Unreleased` describing the fix (no version bump; per AGENTS.md mobile versioning).

## Edge cases

- Sheets/modals open over room (`MessageActionsSheet`, `MessageInfoModal`, `ReportModal`, `RaiseSignalModal`): their `BackHandler` listeners register after the screen one, so LIFO still closes them first. Verify by manual test, not by reordering code.
- Room panels/keyboard: unchanged, still consume back before navigation.
- Same-route param change (room reused across `clusterId`): hook takes `clusterId` in deps so the fallback always points at the visible cluster.
- `profile/[userId]` without `cluster` param: falls back to `/(app)/home` (matches its existing `useEffect` redirect in `profile/[userId].tsx:80-84`).
- Predictive back gesture: same `hardwareBackPress` path on Android; no extra handling needed.
- iOS: no hardware back; UI buttons keep working via shared `goBack`.

## Tests

- Unit (colocated, `mobile/` Vitest): new `use-cluster-back.test.ts` covering back vs fallback, `true` return, unsubscribe on blur/unmount, and fallback updates on `clusterId` change.
- Manual matrix on an Android device or emulator (preview build, not Expo Go for call paths):
  1. Normal: home -> room -> members, back returns to room; room back returns to home; home back exits (correct).
  2. Section hop: room -> signals -> signal detail, back walks detail -> signals -> room.
  3. Cold-start push to signals / signal detail / votes / meetups: back goes to room (or signals list for detail), never OS home. Second back goes home.
  4. Cold-start push to room: back goes home (existing behavior).
  5. Sheet open in room: back closes sheet, second back goes home.
- Gates per AGENTS.md: `npm run lint`, affected mobile tests, `npm run build`. No coverage-threshold change, no migration so no `test:integration` reset, no synced web files so no `sync-db-types --check`. Docs-only plus this plan file does not need a build gate, but the implementation PR does.

## Acceptance

- Back from every row in the fallback table never lands on the phone home screen, with or without history.
- Normal in-app trails still walk backward (no forced jump to room when history exists).
- Room back still closes panels/keyboard first, then goes home.
- Call exit still uses `router.back()` and never resurfaces a dead PreJoin.
- `lint`, unit tests, and `build` pass; CHANGELOG entry present.

## Work order

1. Add `use-cluster-back.ts` + unit test.
2. Wire hook into list/section screens (members, signals, votes, settings, meetups).
3. Wire hook into detail screens (signal detail, meetups/new, appearance, introductions, waiting, profile) and swap their UI back buttons to `goBack`.
4. Manual back-matrix on Android (normal, section hop, cold-start push per target, sheet-open).
5. `npm run lint`, mobile unit tests, `npm run build`; add `mobile/CHANGELOG.md` Unreleased entry.

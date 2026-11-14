# Mobile Stack Navigation Plan

Status: implemented, pending the manual iOS and Android device soak below.
This finishes the Tabs-to-Stack restructure that
`docs/archive/MOBILE_NAV_KEYBOARD_FIX_PLAN.md` listed as deferred, and it
supersedes the tab-specific assumptions in
`docs/archive/CLUSTER_BACK_NAVIGATION_PLAN.md`.

Scope: `mobile/` only. No web, schema, RLS, RPC, Edge Function, or migration
changes.

## Goal

Give every pushed detail screen the platform-standard back gesture:

- iOS: the native `UINavigationController` edge swipe.
- Android: the native stack pop, including predictive back, instead of a
  hand-rolled `BackHandler` fallback.

Keep today's user-visible behavior everywhere except one deliberate change:
leaving the call screen (back or swipe) now leaves the call instead of
minimizing it (see decision 7).

## Why the gesture is missing today

The member shell is a single `Tabs` navigator
(`mobile/app/(app)/_layout.tsx`). Every detail route (room, members, signals,
post detail, profile, settings sub-screens) is a hidden tab screen, not a stack
push. Android's system back is an OS event handled by `BackHandler` in
`mobile/src/lib/use-cluster-back.ts` plus `backBehavior="history"`. iOS has no
equivalent OS event: its swipe-back is implemented by `UINavigationController`
and only exists inside a native stack. Tab navigators never present it, so iOS
detail screens only had the in-screen back buttons.

The tab architecture also causes the stale-composer and retained-panel issues
described in `MOBILE_NAV_KEYBOARD_FIX_PLAN.md`: detail screens stay mounted
across parameter changes.

## Target structure

One native Stack above the tabs, with all details as stack siblings:

```
mobile/app/(app)/
  _layout.tsx                 native Stack, anchor "(tabs)"
  (tabs)/
    _layout.tsx               Tabs: home, posts, notifications, clusters, settings
    home.tsx                  moved
    posts.tsx                 moved
    notifications.tsx         moved
    clusters.tsx              moved
    settings.tsx              moved
  cluster-created.tsx         pushed
  clusters/new.tsx            pushed
  mode/[modeId].tsx           pushed
  posts/[postId].tsx          pushed
  profile/[userId].tsx        pushed
  queue/[queueId].tsx         pushed
  invites/[invitationId].tsx  pushed
  settings/profile.tsx        pushed
  settings/muted.tsx          pushed
  settings/reports.tsx        pushed
  cluster/[clusterId]/*       pushed (room, members, signals, votes, meetups, call, ...)
```

A flat stack is deliberate. Per-tab stacks would require duplicate copies of
shared detail routes (post detail and profile open from several tabs). A nested
`cluster/[clusterId]` stack would put the room at the root of a child navigator,
where the parent edge gesture does not fire, so swipe-back from the room would
break.

The root `mobile/app/_layout.tsx` Stack stays as it is, with `(app)` as one
screen. Legal pages, `restricted`, and `appeal` remain root-stack pushes.

## Decisions

### 1. URL paths do not change

Route groups do not appear in URLs. Moving the five tabs under `(tabs)` keeps
`/home`, `/posts`, `/clusters`, `/settings`, `/notifications`, and every
`/cluster/:id/...`, `/posts/:id`, `/profile/:id` path identical. Push payloads,
notification routing, and deep links therefore work unchanged.

Only `/(app)/...` group-prefixed hrefs need normalizing, because the generated
typed routes no longer contain that form once `home` and friends live under
`(app)/(tabs)`. Replace them with the short form:

| Current | New |
|---|---|
| `/(app)/home` | `/home` |
| `/(app)/clusters` | `/clusters` |
| `/(app)/posts` | `/posts` |
| `/(app)/settings` | `/settings` |
| `/(app)/settings/profile` | `/settings/profile` |
| `/(app)/settings/muted` | `/settings/muted` |
| `/(app)/settings/reports` | `/settings/reports` |

Files with occurrences: `mobile/app/index.tsx`, `mobile/app/auth/callback.tsx`,
`mobile/app/privacy-policy.tsx`, `mobile/app/terms.tsx`,
`mobile/app/child-safety.tsx`, all detail screens under `(app)`,
`mobile/src/lib/auth-navigation.ts`, `mobile/src/lib/notification-routing.ts`,
and the two test files listed below.

`/(auth)/...` and `/(onboarding)` are untouched.

### 2. Returning to a tab from a detail uses dismiss, not replace

Several detail screens currently say "go home" or "go to clusters" with
`router.replace('/home')` or `router.replace('/clusters')`. That worked when
both screens were tabs, because replace was a tab jump. On a stack the detail
sits above `(tabs)`, and replacing it with a route that lives inside the tabs
navigator can replace the stack screen with a second `(tabs)` entry.

Use `router.dismissTo('/home')` (or the target tab) for these actions. It pops
to the route when it is already in the state and replaces only when it is not.
The same change applies to the fallback arm of `goBackWithFallback`: when
`canGoBack()` is false, call `router.dismissTo(fallback)` instead of
`router.replace(fallback)`.

Affected call sites:

- `mobile/app/(app)/cluster/[clusterId]/room.tsx` (three exits to home)
- `mobile/app/(app)/cluster/[clusterId]/settings.tsx` (after leaving a cluster)
- `mobile/app/(app)/invites/[invitationId].tsx` (decline)
- `mobile/app/(app)/profile/[userId].tsx` (missing-cluster redirect)
- `mobile/app/(app)/queue/[queueId].tsx` (mode unavailable)
- `mobile/src/lib/use-cluster-back.ts` fallback arm

Push taps and notification taps can land on a tab route while a detail is
open. `pushDataToHref` and `mobileTarget` return strings for `/home`,
`/clusters`, `/posts`, `/notifications`, and `/settings`, so those use
`router.navigate` and detail objects keep `push`. `isTabTarget` in
`notification-routing.ts` makes that split explicit; pushing a tab from a
detail would add a second tab group.

Replace between two detail screens stays `router.replace`: waiting -> room,
clusters/new -> members, and cluster-created -> introductions are all stack
siblings, which is the normal replace use case.

If `dismissTo` cannot find the tab route inside `(tabs)` during device testing
(it would replace instead of pop), use `router.dismissAll()` followed by
`router.navigate(target)`: pop the closest stack to `(tabs)`, then select the
tab.

### 3. Anchor the tabs under every detail route

Add to `mobile/app/(app)/_layout.tsx`:

```ts
export const unstable_settings = { anchor: '(tabs)' }
```

Add to `mobile/app/(app)/(tabs)/_layout.tsx`:

```ts
export const unstable_settings = { anchor: 'home' }
```

Expo Router 58 reads `unstable_settings.anchor` (verified in
`node_modules/expo-router/build/layoutAnchor.js`) and seeds the navigator state
with that route. A cold-start push tap or deep link to `/posts/:id` then gets
`(tabs)` underneath, with Home as the base tab, so back and swipe-back land on
Home instead of exiting the app or landing on an arbitrary tab. This replaces
the "single-entry history" fallback that `useClusterBack` exists for today.

The tabs anchor also makes the initial tab deterministic. The member shell
currently lands on Home because `app/index.tsx` redirects to `/home`, but a
deep-linked detail never passes through that redirect.

### 4. Tabs layout and screen options move down one level

- `(app)/_layout.tsx` keeps the auth redirect, active-account gate, notifications
  channel, push tap handling, and badge sync. It renders only the `Stack`.
  This layout stays mounted while a detail is pushed, so the push listeners keep
  working from any screen.
- `(tabs)/_layout.tsx` owns the five `Tabs.Screen` entries, tab icons, titles,
  badges, and `backBehavior="history"`. Keeping `history` preserves the Android
  behavior where back from one tab returns to the previously visited tab.
- Delete `HIDDEN_TAB` and every `tabBarStyle: { display: 'none' }` entry. Stack
  screens cover the tabs, so the tab bar is absent without per-route hacks.
- Remove the call screen's `animation: 'fade'` override and rely on the native
  push animation. The default push is the configuration where the iOS
  interactive pop gesture is guaranteed to work; custom transitions are a risk
  we do not need to take.

### 5. Detail screens unmount on back

This is the intended fix for stale composer, picker, and modal state: a popped
route unmounts and remounts fresh. Existing per-id `key` props stay; they are
still useful for same-route parameter changes and duplicate pushes.

### 6. Native stack owns back; keep only behavior that is genuinely custom

- `useClusterBack(fallback)` becomes a UI-back helper: it returns
  `goBackWithFallback(fallback)` and no longer registers a `BackHandler`
  subscription. Remove `subscribeClusterBack` and `createClusterBackHandler`
  plus their tests.
- Detail screens rely on the stack pop for Android hardware back. This also
  restores predictive-back animation on those screens.
- Room keeps its `BackHandler` because it must close the composer panels and
  keyboard first. It returns false once both are closed, so the native stack
  performs the pop and keeps its predictive-back animation; only the no-history
  cold start falls back to Home. The keyboard branch checks
  `Keyboard.isVisible()` rather than the input focus flag, because Android's IME
  can consume the back to hide the keyboard without firing blur, which made one
  extra press dismiss an already-hidden keyboard. On iOS the edge swipe cannot
  be intercepted by `BackHandler`; the blur cleanup already resets panels and
  keyboard, so a swipe that leaves with a panel open is safe. If that feels
  wrong on device, the follow-up is
  `navigation.setOptions({ gestureEnabled: false })` while panels are open, not
  a timing workaround.
- `clusters/new` keeps its step-back `BackHandler`, and adds
  `navigation.setOptions({ gestureEnabled: step === 0 })` so the iOS swipe does
  not discard a partially filled multi-step form from steps 2 and 3.
- `(onboarding)/index.tsx` is a single-screen stack, so it needs no gesture work.
- Modal and sheet `BackHandler` listeners are unchanged and still win over the
  screen because they register later (LIFO).

### 7. Leaving the call screen leaves the call

Today the call screen is a tab route, so it stays mounted when the user backs
out: Android back minimizes the call and the room banner can reopen it. A stack
pop unmounts the screen, which already triggers the existing unmount cleanup
that calls `leave_call`. That is the accepted behavior for this change.

- Update the comments in `call.tsx` that describe tab retention, `JUMP_TO`, and
  `backBehavior` history.
- Update the comment in `CallControls.tsx` that assumes a mounted tab keeps the
  media connection alive. Explicit disconnect on hang-up still matters because
  the screen also unmounts on state resets.
- The room banner's `Open` state now only appears while the user is actually on
  the call screen. Back or swipe returns to the room, and the banner reads
  `Join` again.
- If minimizing a call becomes a requirement, it needs a separate change that
  hoists the LiveKit session into a provider mounted in `(app)`. That is not
  part of this plan.

### 8. Cluster menu switches sections instead of stacking every hop

`ClusterMenu` currently uses `router.push` for its section buttons. With a tab
navigator that was a tab switch; with a stack it would push a new screen for
every hop (room -> members -> signals -> votes), making back retrace each hop.
Change the menu to `router.navigate(href)`: it pops back to an already-open
section when one exists and pushes otherwise. If `navigate` shows an unwanted
param-reuse edge case during testing, fall back to `push` and accept the trail.

All other links keep push semantics.

## Files

New:

- `mobile/app/(app)/(tabs)/_layout.tsx`

Moved (content changes only for relative imports):

- `mobile/app/(app)/home.tsx` -> `mobile/app/(app)/(tabs)/home.tsx`
- `mobile/app/(app)/posts.tsx` -> `mobile/app/(app)/(tabs)/posts.tsx`
- `mobile/app/(app)/notifications.tsx` -> `mobile/app/(app)/(tabs)/notifications.tsx`
- `mobile/app/(app)/clusters.tsx` -> `mobile/app/(app)/(tabs)/clusters.tsx`
- `mobile/app/(app)/settings.tsx` -> `mobile/app/(app)/(tabs)/settings.tsx`

Rewritten:

- `mobile/app/(app)/_layout.tsx` (Stack, anchor, push listeners)

Edited:

- `mobile/app/(app)/clusters/new.tsx` (gesture option)
- `mobile/app/(app)/cluster/[clusterId]/room.tsx` (comments, fallback paths)
- `mobile/app/(app)/cluster/[clusterId]/call.tsx` (comments)
- `mobile/src/components/room/call/CallControls.tsx` (comment)
- `mobile/src/components/ClusterMenu.tsx` (`router.navigate`)
- `mobile/src/lib/use-cluster-back.ts` (remove subscription, `dismissTo` fallback)
- `mobile/src/lib/auth-navigation.ts`, `mobile/src/lib/notification-routing.ts`
  (short hrefs)
- every file in the href table above
- `mobile/app/(app)/cluster/[clusterId]/settings.tsx`,
  `mobile/app/(app)/invites/[invitationId].tsx`,
  `mobile/app/(app)/profile/[userId].tsx`,
  `mobile/app/(app)/queue/[queueId].tsx` (`dismissTo` instead of replace-to-tab)
- `mobile/src/lib/use-cluster-back.test.ts`,
  `mobile/src/lib/auth-navigation.test.ts` (fallback strings, removed exports)
- new `mobile/src/lib/notification-routing.test.ts` (`isTabTarget`)
- `mobile/README.md` (structure and navigation notes)
- `mobile/CHANGELOG.md` (Unreleased entry)

## Verification

Automated, from `mobile/`:

```
npx expo export --platform android --output-dir dist-check --clear   # regenerates .expo/types
npx tsc --noEmit -p tsconfig.json
npx oxlint
npx vitest run
npx expo-doctor
```

`expo export` must run before `tsc` locally so typed routes reflect the move.
CI runs the same gates except that its fresh checkout has no `.expo/types`, so
the short hrefs are the safe form.

No `supabase db reset`, integration suite, or `sync-db-types --check` is needed:
nothing outside `mobile/` changes.

Manual device matrix, required before merge because the deferred plan called
this out and Windows cannot exercise the iOS gesture:

1. iOS, light and dark: edge-swipe back from room, members, signals, signal
   detail, votes, meetups, meetups/new, appearance, cluster settings, post
   detail, profile, mode, queue, invite, cluster-created, settings/profile,
   settings/muted, settings/reports, legal pages.
2. iOS swipe on the call screen: leaves the call, room banner returns to Join,
   remote participant count drops.
3. Android hardware and predictive back from the same screens: pops one screen,
   never exits the app on a normal trail.
4. Cold start via push tap and deep link to room, post, profile, signal detail,
   and invite: back lands on the expected tab, not the OS home screen.
5. Tabs: switch Home -> Posts -> Clusters, then Android back walks the visited
   tabs and only then exits.
6. Wizard: `clusters/new` step 2 and 3, iOS swipe does nothing, Android back
   goes one step, Back button goes one step, step 1 exits to Clusters.
7. Room: open GIF/emoji/menu and keyboard, Android back closes them first, then
   pops to the previous screen. iOS swipe with a panel open leaves cleanly.
8. Auth: sign in, back from Home never returns to login; sign out from Settings
   and from inside a detail screen returns to login, and back never returns to
   Home or to the old detail.
9. Tab exit from a detail: leave a cluster from cluster settings, decline an
   invite, and hit a mode-unavailable queue. Each lands on the target tab with
   one tab entry, not a duplicate `(tabs)` screen; back then exits or walks the
   tab history, it does not reveal the same tab again.
10. Keyboard and draft soak: open 10+ clusters and posts, confirm composers are
    empty, footers have no strip, and no sheet state survives a pop.
11. Push tap while already inside a detail screen: target pushes normally and
    back returns to the previous screen.

## Acceptance

- iOS edge swipe works from every pushed detail route and never fights the
  message swipe-to-reply gesture in the room.
- Android back is a native stack pop on detail routes, including predictive
  back, with the room and wizard keeping their intentional custom handling.
- No hidden tab routes remain; the tab bar appears only on the five tab screens.
- URLs, push routing, deep links, and notification targets are unchanged.
- Returning to a tab from a detail pops the stack; there is never a second
  `(tabs)` entry in the history.
- Leaving the call screen leaves the call, as decided; no tab-retention
  comments remain in the code.
- `tsc`, `oxlint`, Vitest, `expo-doctor`, and the Android export pass.
- `mobile/CHANGELOG.md` has an Unreleased entry.

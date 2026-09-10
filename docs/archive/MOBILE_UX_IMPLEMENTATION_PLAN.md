# Sensorium Mobile UX Implementation Plan

Scope: the mobile-specific experience gaps found while reviewing the Expo app (`mobile/`) against the web SPA and `docs/archive/MOBILE_APP_PLAN.md`. Web behavior is the baseline; each item here is a change that is **mobile-only** and does not alter web screens, backend contracts, or the shared Supabase schema. (Push notification delivery was reviewed and is intentionally **out of scope** — see "Deferred: push notifications" below.)

The mobile app already has the right kind of platform-native polish for a few areas: long-press to react (`MessageActionsSheet`, `PostActionsSheet`), pinch-zoom image lightbox (`ZoomableImage`), `KeyboardAvoidingView` chat with multiline composer, and `SafeAreaView` usage. This plan does **not** re-litigate those — it fills the remaining gaps.

Principle from `AGENTS.md` and `MOBILE_APP_PLAN.md`:
- Strict TS, `@/` → `src/`, only design tokens from `src/lib/theme-tokens.ts` (no new colors/radii).
- Components never talk to Supabase directly — reads/writes stay in `src/features/` hooks.
- No comments unless they carry meaning.
- Keep web untouched and green: `npm run lint`, `npm run test:coverage`, `npm run build`.

---

## Summary of the gaps

| # | Area | Severity | Type |
|---|------|----------|------|
| 1 | Pull-to-refresh across feeds | High | Mobile-only UX (missing) |
| 2 | Feed list virtualization | High | Mobile-only performance |
| 3 | Haptic feedback on reactions/likes | Medium | Mobile-only polish |
| 4 | Touch targets below 44pt | Medium | Mobile-only accessibility |
| 5 | Chat list uses `FlatList` not `FlashList` | Medium | Mobile-only performance |

---

## Phase 1 — Pull-to-refresh (High)

### Why
Web refreshes via `refetchOnWindowFocus` and browser reload. Mobile disabled window-focus refetch (`mobile/src/app-providers.tsx:15`) and has no reload gesture. Today users can only refresh by leaving/re-entering a screen or relying on Realtime. A mobile user has no way to force a refetch after dropping connection.

### What to change
Wire `RefreshControl` (via `refreshControl` prop on the scroll/list) to `refetch()` of the screen's primary query(s). Use TanStack Query's `isFetching`/`refetch()`; **do not** re-run mount effects.

Target screens and the query(ies) to refresh (all use the `Screen` component → `ScrollView` in `mobile/src/components/ui.tsx:239`):

| Screen | File | Query hook(s) to refetch |
|--------|------|--------------------------|
| Home | `mobile/app/(app)/home.tsx` | `useMyClusters`, `useMyPendingInvitations`, `useLatestClusterFormed`, `useRecentClusterPosts`, per-cluster `useClusterMembers` |
| Clusters | `mobile/app/(app)/clusters.tsx` | `useMyClusters`, `usePublicClusterCounts`, `useMyQueueStatus` |
| Posts feed | `mobile/app/(app)/posts.tsx` | `useClusterPosts`, `useClusterPostLikes`, `useClusterPostComments` |
| Notifications | `mobile/app/(app)/notifications.tsx` | `useMyNotifications`, `useUnreadCount` |
| Members | `mobile/app/(app)/cluster/[clusterId]/members.tsx` | `useClusterMembers`, `useReplacementRound` |
| Signals | `mobile/app/(app)/cluster/[clusterId]/signals.tsx` | `useClusterSignals`, `useSignalReplies` |
| Votes | `mobile/app/(app)/cluster/[clusterId]/votes.tsx` | `useClusterVotes` |
| Mode detail | `mobile/app/(app)/mode/[modeId].tsx` | queue status hooks |
| Queue | `mobile/app/(app)/queue/[queueId].tsx` | queue count/status hooks |

### Approach
1. Add a small reusable helper to `mobile/src/components/ui.tsx`, e.g. a `refreshControlProps(refetch, refreshing)` util, or extend `Screen` to accept an optional `refetch`/`onRefresh`. Prefer **extending `Screen`** so every tab screen opts in uniformly and we don't repeat glue code.
   - `Screen` currently renders a plain `ScrollView`. Add optional props `onRefresh?: () => void` and `refreshing?: boolean`; when `onRefresh` is set, attach `RefreshControl` tinted with `t.primary`.
2. Share one `usePullToRefresh(tasks)` hook (`mobile/src/lib/use-pull-to-refresh.ts`) instead of per-screen glue. It keeps a local `refreshing` state (rather than OR-ing each query's `isRefetching`) so the spinner also covers nested child queries, guards double-pulls with a ref, and surfaces the first task failure as an error string rendered through each screen's existing `ErrorText`/error card. Prefer each screen's own hook `refetch()`s; use `queryClient.refetchQueries({ queryKey })` (which awaits, unlike `invalidateQueries`) only for queries owned by child components. Accepted limitation: `refetchQueries` resolves `void`, so a child-owned query failure can't reach the hook's error string — those failures surface only where the child already renders query-error UI (e.g. Home's recent-posts card); everywhere else they stay silent exactly as before this change.
3. For feeds that switch selected cluster (`posts.tsx`), refetch the currently-selected cluster's hooks only.
4. For screens using `FlatList`/nested lists (Phase 2 converts feeds), attach `refreshControl` the same way — `RefreshControl` works on virtualized lists too.

### Acceptance criteria
- Pull down on every target screen shows the native spinner and refetches without remounting.
- `refreshing` stops when all refetches settle; errors surface in the screen's existing error states (do not add new error UI).
- Pull-to-refresh does not interrupt chat scroll position or Realtime.

### Risks / notes
- Chat `room.tsx` is an inverted `FlatList`; pull-to-refresh on an inverted list behaves oddly — **exclude the room** from this phase. Keep the existing "Load earlier messages" + focus refetch.
- Do not refetch while the previous refetch is pending (guard with `isRefetching`).

---

## Phase 2 — Feed list virtualization (High)

### Why
Posts feed (`mobile/app/(app)/posts.tsx:174`), notifications (`mobile/app/(app)/notifications.tsx:146`), Home (`mobile/app/(app)/home.tsx:280`), and Members (`mobile/app/(app)/cluster/[clusterId]/members.tsx:76`) all render full lists with `.map()` inside a `ScrollView`. In a browser DOM this is fine; on a phone it keeps every item mounted, hurting memory and scroll performance as these grow. This contradicts the plan's own `@shopify/flash-list` recommendation.

### What to change
Convert the long, monotone lists to a virtualized list. Lead with the **notifications** and **posts feed** (the two that can grow unbounded). Members is capped at 8 (`CLUSTER_SIZE`) so virtualization gains little — keep its `.map()`.

#### Notifications (`notifications.tsx`)
- Replace the `items.map(...)` block with a `FlatList`.
- Keep the header + "Mark all read" row above the list (structure: `Screen`-level header, then a `FlatList` with `flex: 1` for the rows). Since `Screen` wraps children in a `ScrollView`, the notifications screen should stop using `Screen`'s ScrollView and use the `FlatList` as the scroll container. Simplest correct structure: `SafeAreaView` → header `View` → `FlatList` (rows).
- `keyExtractor={(n) => n.id}`, `ItemSeparatorComponent` (or `marginBottom` on the row), `keyboardShouldPersistTaps="handled"`.
- Add `ListEmptyComponent` = current empty `Card`, and pull-to-refresh from Phase 1 via `refreshControl`.
- Keep `ListHeaderComponent` = nothing; the header stays outside.

#### Posts feed (`posts.tsx`)
- Prefer `FlashList` (inverted not needed). If `@shopify/flash-list` is not installed, use `FlatList` first (zero new dependency) and note `FlashList` as the follow-up in Phase 5.
- Same structural change: header (title, sort control, cluster chip row), `PostComposer`, then the virtualized list of `PostCard`s, then a footer `Load earlier posts` via `ListFooterComponent` (replaces the trailing `.map` + button).
- `PostCard` is already a self-contained component — virtualization needs no change to it.
- Keep the muted-author substitution logic; it maps 1:1 to `renderItem`.

#### Home (`home.tsx`)
- Lowest priority of the three (bounded items). If easy, convert the cluster + recent-posts sections; otherwise leave and document. Do not force it — Home is a dashboard, items are few.

### Acceptance criteria
- Scroll stays smooth on the posts feed and notifications with 100+ items on a mid-range Android device.
- Sorting, cluster switching, like/comment counts, muting, and "Load earlier" all still behave identically.
- Pull-to-refresh (Phase 1) works from the virtualized list.

### Risks / notes
- Do not nest a `FlatList` inside `Screen`'s `ScrollView` (virtualized list inside same-orientation ScrollView throws / is unsupported). Must restructure so the list is the scroll container.
- Realtime inserts while scrolled: keep current behavior (new posts appended/refreshed via React Query + channel). No change to that logic.

---

## Phase 3 — Haptics (Medium)

### Why
`expo-haptics` is not installed. On mobile, tactile feedback on reactions/likes/send is standard and cheap to add; it directly extends the long-press-to-react work already shipped.

### What to change
1. Add dependency `expo-haptics` (`mobile/package.json`) — it's a companion to `expo-notifications`, already in the Expo SDK line used here.
2. Add a tiny wrapper `mobile/src/lib/haptics.ts` with named helpers, e.g. `impactLight()`, `impactMedium()`, `selectionChanged()`, `success()` — each guards with `Platform.OS !== 'web'` and best-effort try/catch (no comments needed; name is the meaning).
3. Apply:
   - Toggling a reaction in `MessageActionsSheet.tsx` → `impactLight()` on emoji press.
   - Liking a post in `PostCard.tsx:142` (the `onLike` handler) → `selectionChanged()` on toggle; `impactMedium()` when activating.
   - Sending a message in `Composer.tsx` `handleSend` → `impactLight()`.
   - Destructive confirmations (delete post `PostCard.tsx:58`, delete message) → `success()` on the final confirm to signal completion (confirm UI already exists — no new confirm flows).
4. Keep haptics subtle and non-blocking: fire-and-forget, never awaited.

### Acceptance criteria
- Reaction, like, send, and delete-confirm produce a light, distinct haptic on iOS and Android; none on web (no `react-native-web` haptics).
- No errors thrown if haptics are unavailable.

### Risks / notes
- `expo-haptics` requires a native build; it won't do anything in Expo Go on web, but `selectionAsync`/`impactAsync` work in Expo Go on device. `Platform.OS !== 'web'` guard keeps `npm run lint`/typecheck clean since the module types are present.

---

## Phase 4 — Touch targets ≥44pt (Medium)

### Why
Web has no touch-target rule; RN buttons here under 44pt are hard to hit on a phone. Found sub-44pt interactive elements:

| Location | Size |
|----------|------|
| `room.tsx:447` — Back | 36×36 |
| `Composer.tsx:186` — Cancel reply, `Composer.tsx:214` — Remove image | 24×24 |
| `PostCard.tsx:163` — MoreVertical (actions) | 32×32 |
| `MessageActionsSheet.tsx:72` / `MessageItem` reaction emoji | 40×40 (borderline) |

### What to change
- Bump the affected `Pressable`s to a visible target ≥44pt (`width`/`height` and matching `borderRadius`), keeping the icon optically centered (icon size unchanged; padding absorbs the rest). Do not change visual layout spacing — only hit-area expansion.
- Prefer `hitSlop` where growing the box would disturb layout, but for these simple rounded targets growing the box is cleaner and matches existing 44px pattern in `Composer.tsx:275,325`.

### Acceptance criteria
- All primary interactive targets are ≥44×44pt (or have `hitSlop` achieving the same effective area).
- No visual regression to spacing or alignment on small devices.

### Risks / notes
- `MessageActionsSheet`/`PostActionsSheet` rows already use `paddingVertical: 14` + ~18px icon → ~44px row height; only the reaction pills and the small icon buttons need attention.

---

## Phase 5 — Chat list to FlashList (Medium)

### Why
`mobile/app/(app)/cluster/[clusterId]/room.tsx:516` uses `FlatList` for the heaviest, most interactive list (pagination, reactions, replies, typing, votes, signals inline). `MOBILE_APP_PLAN.md` specified `@shopify/flash-list`; it isn't installed (`mobile/package.json`).

### What to change
- Add `@shopify/flash-list`.
- Swap the inverted `FlatList` → inverted `FlashList` in `room.tsx`, preserving: `inverted`, `keyExtractor`, `onEndReached`/threshold for "Load earlier", `onScroll` pinning + `newCount` logic, `ListFooterComponent`, `scrollToOffset` ref used by `scrollToLatest`, and all `renderItem` branches (signal/vote/message + muted placeholders).
- Type the `FlashList` ref to keep `listRef` calls (`scrollToOffset`) compiling.

### Acceptance criteria
- Chat scrolls smoothly with a full cluster history and many reactions; jump-to-latest and load-earlier still work.
- `ref`-based `scrollToOffset({ offset: 0, animated: true })` in `scrollToLatest` and the pinned auto-scroll still function.

### Risks / notes
- Inverted `FlashList` requires `maintainVisibleContentPosition` defaults; verify the new-message auto-scroll (`room.tsx:279`) still triggers. Keep a fallback to the current `FlatList` if FlashList's inverted behavior regresses pinning.

---

## Out of scope (intentionally not mobile changes)
- **Admin/moderation**: stays web-only per `MOBILE_APP_PLAN.md`.
- **Web app**: no changes under `src/` from this plan.
- **Re-litigating** existing decisions (cluster size, cooldown, signal categories, unified inbox) — all stay as web behaves.
- **Offline-mutation queue**: acknowledged as future (`MOBILE_APP_PLAN.md` Phase 5) but out of this plan to avoid scope creep.

---

## Sequencing & dependencies

1. **Phase 1 (pull-to-refresh)** — independent, do first; every tab screen benefits.
2. **Phase 2 (virtualized posts feed + notifications)** — builds on the same screens as Phase 1; do together per screen so each screen is touched once (header/scroll structure change + refresh control in one edit).
3. **Phase 4 (touch targets)** — independent, tiny, can interleave.
4. **Phase 3 (haptics)** — needs a new dependency (`expo-haptics`) + native build; bundle with the next native-build/EAS cycle, not a JS-only OTA.
5. **Phase 5 (FlashList in chat)** — new dependency; bundle with Phase 3's native build cycle.

Recommended single-package slice for the mobile-only UX work: **Phases 1 + 2 + 4** (pure JS, no new native deps, no backend) as one PR. Phases 3 + 5 add two native deps → a second PR. All of this plan is JS/mobile-only; nothing touches web or the Supabase backend.

---

## Verification

Per `AGENTS.md`:
- `cd mobile && npm run lint`
- `cd mobile && npm test` (Vitest)
- Web stays green: `npm ci && npm run lint && npm run test:coverage && npm run build` (must not regress the coverage gate 34/33/20%).
- Manual: Expo Go / dev-build on two devices — pull-to-refresh on each target screen, scroll posts/notifications with seeded data, haptic on like/react/send, 44pt tap accuracy.

## Deferred: push notifications (out of scope for this plan)

Push **token registration** already ships (`mobile/src/lib/push.ts`, wired in `mobile/src/app-providers.tsx`), and the schema exists (`supabase/migrations/0094_push_tokens.sql`, `0097_push_tokens_upsert.sql`). But **no backend worker fans notifications out to those tokens**, so mobile users currently get in-app + foreground realtime only. This plan intentionally does **not** address delivery: it would touch `supabase/functions/` + a new migration + integration tests and needs its own product decision (ship an Expo fan-out worker, or drop token registration). Tracking it here keeps the gap explicit without blocking the mobile-only UX work.
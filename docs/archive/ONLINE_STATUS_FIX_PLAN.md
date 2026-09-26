# Online Status Fix Plan

Goal: fix the ephemeral online status stack (network banner + per-cluster presence) on web and mobile with no schema change. No `last_seen` column, no heartbeat RPC, no new migration in this plan.

Locked scope from review: ephemeral fixes only, self always shows online, background means immediately offline.

## 0. Where things stand

Web:

- `src/lib/use-online.ts:12`: `useSyncExternalStore` with `window online/offline` events, snapshot `() => navigator.onLine`. Used by `src/components/OfflineBanner.tsx:5` and layout shifts in `FixedThemeToggle.tsx:6`, `RestrictedAccountPage.tsx:22`.
- `src/features/realtime.ts:627` `usePresence(clusterId)`: per-cluster channel `presence:<clusterId>`, payload `{ user_id, typing }`, `sync/join/leave` refresh from `presenceState()`, `track()` after `SUBSCRIBED`, shared `presenceStore` to avoid "cannot add presence callbacks after subscribe()", transition-only `signalTyping/resetTyping` with `broadcastTyping` re-broadcast. Tested in `src/features/realtime.test.tsx:327`.
- Consumers force self online: `src/pages/cluster/RoomView.tsx:110`, `src/pages/cluster/MembersView.tsx:35`, `src/pages/ProfilePage.tsx:89` (`online.has(id) || id === userId`).
- `src/app/providers.tsx:9`: `QueryClient` with `staleTime 30s`, custom retry, no custom `onlineManager` needed on web (TanStack listens to `window` events by default).

Mobile:

- `mobile/src/lib/use-online.ts:7`: `expo-network` `getNetworkStateAsync` + `addNetworkStateListener`, `isInternetReachable ?? isConnected`, 3s debounce to offline, re-check on `AppState active`. Used by `mobile/src/components/OfflineBanner.tsx:8`.
- `mobile/src/features/realtime.ts:621` `usePresence`: hand-mirrored copy of web (pinned, do not overwrite via sync script). Same self-exclusion plus ref-counted `clusterChannelEntries` for bottom-tab multi-mount.
- `mobile/src/app-providers.tsx:13`: `QueryClient` with no `onlineManager.setEventListener` and no `focusManager.setFocused` wiring. This is the hard gap: `refetchOnReconnect` and focus refetch do nothing on mobile today.
- `mobile/src/lib/supabase.ts:32`: `AppState` start/stop of auth auto-refresh. Good, keep.
- `mobile/src/features/realtime.ts:19` `byCreatedAsc` lacks the web `id` tie-breaker.

## 1. Locked decisions

1. No persistent status. Presence stays per-cluster ephemeral ("here in this room"). No new table, column, RPC, or cron.
2. Self always shows online. Keep the current `|| isSelf` behavior, but make it explicit and documented so it is not mistaken for real socket state.
3. Background means immediately offline. On `AppState background/inactive` (mobile) and `document hidden` (web), untrack presence at once. On `active/visible`, re-track on next subscribe. No grace period.
4. Keep `expo-network`, do not add NetInfo. TanStack docs sanction `expo-network` as the NetInfo alternative. Fewer native deps.
5. Presence `track()` stays transition-only to respect the Supabase 5 updates per 30s per-client limit (`ClientPresenceRateLimitReached`). No timer-driven track, no per-keystroke track.
6. No new colors, typefaces, or radii. No behavior change to chat, calls, or push.

## 2. Phase 1: mobile query offline wiring

Why: without this, mobile queries neither pause offline nor refetch on reconnect, even though the banner shows.

Files: `mobile/src/app-providers.tsx`, new `mobile/src/lib/query-online.ts` (or inline in providers, prefer small module for testability).

1. Create `query-online.ts` with two setup functions:
```ts
import { AppState, Platform } from 'react-native'
import * as Network from 'expo-network'
import { focusManager, onlineManager } from '@tanstack/react-query'

export function setupQueryOnlineManager() {
  let initialised = false
  const sub = Network.addNetworkStateListener((state) => {
    initialised = true
    onlineManager.setOnline(!!state.isConnected && (state.isInternetReachable ?? true))
  })
  void Network.getNetworkStateAsync()
    .then((state) => {
      if (!initialised) onlineManager.setOnline(!!state.isConnected && (state.isInternetReachable ?? true))
    })
    .catch(() => undefined)
  return () => sub.remove()
}

export function setupQueryFocusManager() {
  const sub = AppState.addEventListener('change', (status) => {
    if (Platform.OS !== 'web') focusManager.setFocused(status === 'active')
  })
  return () => sub.remove()
}
```
2. Call both once in `AppProviders` mount effect (alongside existing `ensureLiveKitGlobals` effect). Return cleanup that removes both subscriptions.
3. Keep `useOnline` UI hook as the banner source. Do not reuse `onlineManager.isOnline()` for the banner; the 3s debounce in `useOnline` is intentional UX anti-flap and differs from query-layer immediacy.
4. Tests: new `mobile/src/lib/query-online.test.ts` mocking `expo-network` and `AppState`, asserting `onlineManager.setOnline` called with `isConnected && isInternetReachable` and `focusManager.setFocused` follows `active` vs `background`. Manual check: airplane mode on device, run query, go offline then online, assert stale queries refetch once.

## 3. Phase 2: presence key + stale identity

Files: `src/features/realtime.ts:646`, `mobile/src/features/realtime.ts:640` (hand-mirror, do not use sync script for this file).

1. Pass explicit presence key per user when creating the channel:
```ts
const channel = supabase.channel(`presence:${clusterId}`, {
  config: { presence: { key: userId } },
})
```
2. On `userId` change, tear down the old entry before creating a new one. Simplest correct rule: include `userId` in the store key (`${clusterId}:${userId}`) or close and delete the entry when `entry.userId !== userId` on effect run. This fixes stale identity after logout/login without full reload.
3. Keep dedupe by `user_id` in `refresh()` (multi-tab same user still collapses to one dot).
4. Tests: extend `src/features/realtime.test.tsx` presence suite to assert `channel` called with `{ config: { presence: { key: 'u1' } } }` and that a `userId` switch creates a new channel and removes the old one. Mirror the same assertions on mobile if a mobile realtime test harness exists (`mobile/src/features/realtime-miss.test.ts` is the closest neighbor, add presence-key test there or in a new colocated test).

## 4. Phase 3: immediate background offline

Files: same two `realtime.ts` files plus web `RoomView` mount points (no new hook needed if done inside `usePresence`).

1. Web `usePresence`: add `visibilitychange` + `window online/offline` handling inside the effect:
   - On `document.hidden`: call `void entry.channel.untrack()` (keep channel subscribed so re-track is cheap, but stop advertising).
   - On `document.visible` + `SUBSCRIBED`: call `void entry.channel.track({ user_id: entry.userId, typing: entry.broadcastTyping })`.
   - On `window offline`: untrack; on `window online`: re-track if visible.
2. Mobile `usePresence`: add `AppState` handling with the same semantics:
   - On `background` or `inactive`: `void entry.channel.untrack()`.
   - On `active`: re-`track()` with current `broadcastTyping` if channel is still subscribed; if the shared entry was torn down while backgrounded, let the normal subscribe path re-track.
   - Reuse `setTimeout` teardown pattern already in the file (mobile uses bare `setTimeout`, web uses `window.setTimeout`; keep each platform idiom).
3. Keep typing transitions intact: background untrack must also reset `broadcastTyping` to `false` or the foreground re-track will wrongly re-advertise typing. Callers already call `resetTyping` on unmount; add it to the background path.
4. Tests: web test dispatches `document.visibilityState` change and asserts `untrack` then `track` called with last typing flag. Mobile test mocks `AppState` and asserts the same. Manual check: two devices in one room, background one, assert its dot drops within a few seconds; foreground it, assert it returns.

## 5. Phase 4: self-online explicit + small correctness fixes

1. Keep self-online behavior per locked decision, but centralize it. Add an exported helper in each `realtime.ts`:
```ts
export function isOnlineNow(online: Set<string>, memberId: string, selfId: string | null) {
  return online.has(memberId) || memberId === selfId
}
```
Replace the three inline `|| id === userId` checks (`RoomView.tsx:110`, `MembersView.tsx:35`, `ProfilePage.tsx:89`) with this helper. Add a short note where it is defined that self is intentionally always shown online and does not reflect socket state.
2. Mobile `byCreatedAsc`: add the web `id` tie-breaker (`|| a.id.localeCompare(b.id)`) so same-timestamp inserts sort identically on both platforms.
3. Web `useOnline` initial snapshot: change getSnapshot/getServerSnapshot to avoid a false-negative flash. Minimal fix is `() => true` for server snapshot (already `() => true`) and keep client snapshot as `navigator.onLine`, or seed `onlineManager`-style default `true` until the first `online/offline` event. Pick one and cover with `OfflineBanner.test.tsx` + `FixedThemeToggle.test.tsx` dispatching `offline` then `online`.
4. No change to `useClusterChannel` in this plan.

## 6. Verification

- `npm run lint`
- `npm test` (web colocated, must include `src/features/realtime.test.tsx`)
- Mobile: run relevant Vitest file for `query-online` and presence, plus `node mobile/scripts/sync-db-types.mjs --check` if any shared type touched (no DB type change expected).
- `npm run build` (typecheck via `tsc -b` plus `vite build`).
- Manual matrix: web online/offline toggle (DevTools network), mobile airplane mode, background/foreground on two devices in one cluster, typing indicator still works and does not hit rate limits.
- No migration, so no `supabase db reset` and no `test:integration` required unless the presence-key change is judged to need a live Realtime check; if so, run `supabase start` + targeted realtime smoke, not the full integration suite.
- E2E `data-e2e="offline-banner"` selector unchanged.

## 7. Out of scope (explicitly not in this plan)

- Global online status or `last_seen` heartbeat, profile "last active X ago", cross-cluster presence.
- Push suppression changes based on presence.
- Replacing `expo-network` with NetInfo.
- High-frequency presence (cursor sharing) or moving typing to Broadcast. Typing stays on Presence transition-only, which is within the documented limit.

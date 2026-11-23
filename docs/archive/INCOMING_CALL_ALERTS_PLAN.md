# Incoming Call Alerts Plan

Goal: a cluster call should reach members wherever they are in the mobile app,
not only when they happen to be sitting in that cluster's room. This is the
"cheap half" of WhatsApp-style calling: app-wide ringing and an OS push, without
CallKit/ConnectionService, VoIP push, or lock-screen answering.

## 0. Scope

In scope:

- An `incoming_call` notification written by `start_call` for every other active
  cluster member.
- The existing push outbox delivers it to every registered device on a new
  high-importance `calls` channel.
- Tapping the push joins the call and opens the call screen.
- A global mobile overlay rings wherever the user is in the app, with Join and
  Dismiss.
- The ringing overlay stops when the call ends, when the user joins, or when the
  user dismisses it.
- Ringtone and vibration while the app is foregrounded.
- The ephemeral ring notification is excluded from the Notifications tab and the
  unread badge, and is deleted when the call ends.

Out of scope (the v2 layer from the earlier assessment):

- CallKit / ConnectionService, VoIP push, lock-screen accept/decline, or
  ringing while the app is killed.
- 1:1 or callee-specific calls. Calls stay cluster-scoped.
- Call history, missed calls, decline semantics, or server-side ring timeout
  semantics. The overlay has a local 60-second silence only.
- A full incoming call screen with accept/decline. The overlay joins the
  existing cluster call.
- Web-wide ringing. Web keeps the existing in-room banner. Web-initiated calls
  still notify mobile members through the same server path.
- Background audio beyond the normal OS notification sound.

## 1. Why it is needed today

- `start_call` inserts a `calls` row and a participant row, nothing else
  (`supabase/migrations/0139_child_cluster_id.sql`).
- `useActiveCall` is only mounted by the room, meetups, and call screens.
- `useClusterChannel` is screen-scoped and torn down on leave.
- `notification_type` has no call value, so the push outbox is never fed.
- Result: a call is invisible unless the user is in that cluster's room.

## 2. Decisions

1. **Notification type**: add `incoming_call` to `notification_type`.
2. **Rows are ephemeral**: write normal `notifications` rows so the existing
   outbox trigger, prefs, account checks, and push pipeline are reused, then
   hide them from the notification center and delete them when the call ends.
3. **No new Settings toggle**: calls are high-signal and rare (one live call per
   cluster). The existing cluster push mute does not silence calls, matching the
   idea that muting chat should not make you miss a call.
4. **Ring only while `status = 'ringing'`**: `join_call` flips the call to
   `active` on the first non-initiator join. Existing room banners cover active
   calls. Changing that lifecycle belongs to the v2 work.
5. **Push tap joins first**: `create-call-token` requires an open participant
   row, so the push handler calls `join_call` before routing to the call screen.
6. **One ringtone asset**, bundled in the app. No new native dependency.

## 3. Server changes

Migration `0212_incoming_call_notification_type.sql`:

- `alter type public.notification_type add value if not exists 'incoming_call';`

Migration `0213_incoming_call_alerts.sql`:

1. Re-issue `fan_out_push_notification()` from `0205` with:
   - `incoming_call` mapped to the `calls` channel.
   - `callId` carried in the payload.
   - cluster push mute skipped for `incoming_call`.
2. Re-issue `get_my_notifications()` and
   `get_unread_notification_count()` from `0156`, excluding `incoming_call` so
   ringing never appears in the inbox or bumps the badge.
3. Add `clear_call_ring_notifications()` and an `AFTER UPDATE OF status` trigger
   on `calls` that deletes `incoming_call` rows and still-queued ring pushes
   when a call becomes `ended`.
4. Re-issue `start_call()` from `0139`, adding, after the call and initiator
   participant are inserted:
   - one `incoming_call` notification per other active `cluster_members` row;
   - title `<display name> started a call`;
   - body `<cluster name>. Tap to join.`;
   - payload `{ call_id }`.
   The existing-live-call branch does not notify again.

Data contract:

- Push `data`: `{ v: 1, kind: 'incoming_call', clusterId, callId }`.
- Push channel: `calls`.
- Notification payload: `{ call_id }`.

## 4. Mobile changes

`mobile/src/features/cluster-calls.ts`:

- `pickIncomingCall(calls, userId)`: pure helper for the ringing candidate.
- `useRingingCall(userId)`: query `calls` where `status = 'ringing'`,
  `initiated_by <> userId`, `expires_at > now()`, newest first, limit 5, then
  pick with the helper. Subscribe to app-wide `calls` INSERT/UPDATE events (RLS
  scopes them to member clusters) and invalidate. Short stale time so a
  foreground returns to a fresh answer.
- `joinCallFromPush(callId)`: best-effort `join_call` used by the push handler.

`mobile/src/components/IncomingCallOverlay.tsx`:

- Uses `useRingingCall`, `useClusterMembers` for the caller's name and avatar,
  and `useJoinCall`.
- Hidden on the room or call route for the active call, and while not signed in.
- Join runs `join_call` and pushes the call screen. Dismiss remembers the call id
  until a different call arrives.
- Plays `mobile/assets/incoming-call.wav` on loop and vibrates only while the app
  is active. Stops on dismiss, join, call end, background, or unmount. The alert
  auto-dismisses after 60 seconds so a missed realtime update cannot ring
  forever; the room banner stays the way back in.
- Mounted once in `mobile/app/(app)/_layout.tsx` above the stack, with a safe
  area top inset.

Push plumbing:

- `mobile/src/lib/push.ts`: add the Android `calls` channel (high importance,
  default sound) and suppress the OS banner and sound for `incoming_call` while
  the app is in the foreground, because the overlay is the alert there.
- `mobile/src/lib/notification-routing.ts`: accept `callId` and route
  `incoming_call` to `/cluster/[clusterId]/call`.
- `mobile/app/(app)/_layout.tsx`: sanitize `callId`; for an incoming call push,
  call `joinCallFromPush` first, then route. If the join fails, land on the room
  instead.
- `src/lib/database.types.ts` + the synced mobile copy: add the new enum value.

## 5. Edge cases

- User already in the room: the room banner is the alert, so the global overlay
  is hidden there.
- User is the initiator: excluded by `initiated_by <> userId`.
- Call ends or expires: realtime UPDATE clears the overlay; the cleanup trigger
  removes the hidden notification rows.
- Push tapped after the call ended: `join_call` fails, and the app opens the room.
- App backgrounded: the OS push is the alert; the in-app ringtone is paused.
- App foregrounded: the overlay rings and the OS banner is suppressed.
- Cluster push mute: calls still ring by design.
- Expo Go: the overlay and ringtone work; Join reaches the existing "needs a
  development build" call-screen message.

## 6. Tests

Unit:

- `pickIncomingCall` ignores non-ringing calls, the caller's own call, and picks
  the newest.
- `pushDataToHref` routes `incoming_call` to the call screen.
- `push-suppress` behavior is unchanged for other types.

Integration (`supabase db reset` first):

- Starting a call writes one `incoming_call` notification for each other member
  and none for the initiator.
- The notification carries `call_id`, appears in `push_outbox` as channel
  `calls` with `callId`, and is absent from `get_my_notifications` and the unread
  count.
- A cluster push mute does not suppress the call push.
- Ending the call deletes the ring notification rows and any queued ring
  pushes.

Gates: `npm run lint`, `npm run test:coverage`, `npm run build`,
`cd mobile && npm test`, `node mobile/scripts/sync-db-types.mjs --check`.

## 7. Rollout and docs

- Deploy is automatic with the migrations: staging on `develop`, production on
  the `develop` to `main` release.
- Update `docs/TECHNICAL.md` (cluster calls), `docs/PRD.md` (call feature), and
  `mobile/CHANGELOG.md` under `Unreleased`.
- Add this plan to `docs/archive/README.md`.

## 8. Effort

One developer, roughly 3 to 5 days including device checks, server tests, and
the docs pass. No native build changes, no store review impact.

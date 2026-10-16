# Chat Push Bundling Plan: one quiet updating notification per cluster

## Goal

Fix the "phone nonstop buzzing when chat pops off" reports on mobile.

Target state for plain chat pushes (`type = message`, channel `messages`):

- One OS notification row per cluster, updated in place, not N stacked rows.
- First message in a burst buzzes once. Follow-ups within a short window update that same row quietly (no repeat vibration or sound) until the user reads or the window expires.
- Mentions stay loud (existing `mentions` channel behavior, unchanged).
- Opening the room still clears that cluster's shade rows and suppresses its foreground banner (existing behavior, kept).

This matches the Discord behavior users cite ("won't send constant alerts if you already have a notification") and the compact Facebook-style grouping in the screenshot. Scope is mobile only. No web app change.

## Non-goals

- No change to the in-app notification center, unread badges, realtime timeline, or `mark_cluster_read` semantics.
- No change to mention, invite, governance, signal, vote, meetup, post, or moderation push types. Only plain `message` pushes coalesce.
- No "suppress all pushes while app is foregrounded" mode. Per-room suppression stays as is (see Decisions 4). Users on home still get buzzed once per burst.
- No per-message vibration control on Android. Expo Push has no per-push vibration flag (sound is iOS only, vibration comes from the channel), so quietness is achieved by sending fewer loud pushes plus a quiet channel, not by a flag on the loud channel.
- No new native module. Use documented Expo Push fields (`tag`, `collapseId`, `channelId`) plus Postgres fan-out logic.
- No edits to applied migrations. Add a new migration.

## Current state (verified)

- Fan-out: `supabase/migrations/0200_voice_notes.sql:212-276` `fan_out_push_for_message()` inserts one `push_outbox` row per recipient token per message. No burst check, no update of queued rows. Title is `<name> sent a message`, body is 140-char preview, `data` carries `{v, kind: message, clusterId, messageId}`.
- Queue shape: `supabase/migrations/0100_push_outbox.sql:15-31` defines `push_outbox` with `channel` check limited to `messages, mentions, invites, governance`. Any new channel needs a migration.
- Worker: `supabase/functions/send-push/index.ts:136-143` maps each claimed row to one Expo Push message with `channelId`, `sound: default`, no `tag`, no `collapseId`, no `threadId`. Each message therefore creates its own shade row and alerts.
- Client channels: `mobile/src/lib/push.ts:46-79` creates `messages` (DEFAULT importance, vibrates `[0, 250, 250, 250]`), `mentions` (HIGH), `invites`, `governance`. No quiet channel exists.
- Foreground suppression: `mobile/src/lib/push.ts:28-39` `setNotificationHandler` hides banner, list, and sound only when `shouldSuppressPushBanner(data, openCluster)` is true, i.e. the push targets the currently open room (`mobile/src/lib/push-suppress.ts:21-27`). Any other cluster still alerts while foregrounded.
- Shade cleanup on open: `mobile/app/(app)/cluster/[clusterId]/room.tsx:207-208` sets the suppressed cluster and calls `clearClusterPushNotifications(clusterId)`, which dismisses presented pushes for that cluster (`mobile/src/lib/push.ts:207-224`). `mobile/app/(app)/_layout.tsx:37` does the same on push-tap routing.
- Read watermark: `cluster_members.last_read_message_at`, advanced by `mark_cluster_read` when the room opens (see `supabase/migrations/0038_last_read_chat.sql`, `0154_read_receipt_batch_cap.sql`). Server can use this to reset the quiet window (Decision 2).
- Expo capabilities (verified in Expo docs, Oct 2026): `tag` is Android only and replaces an already-displayed notification with the same tag. `collapseId` on Android only coalesces in transit (offline) and does not replace shown rows. `threadId` is iOS-only grouping. `channelId` is Android only and drops the push if the channel does not exist on device.

## Decisions

### 1. Tag replacement for visual bundling

`send-push` sets, for `message` pushes only:

- `tag = "cluster-" + clusterId` (from `data.clusterId`)
- `collapseId = same value` (covers offline coalescing)
- iOS: also set `threadId = same value` so a future iOS build groups instead of stacking, and omit `sound` on quiet follow-ups so iPhones update the grouped row silently instead of chiming per message.

Result: N pushes for one cluster collapse to one updating shade row. This is the compact layout ask and ships independently of quietness.

Fallback: if `data.clusterId` is missing, send without `tag` (current behavior). Log nothing PII beyond cluster id presence.

### 2. Quiet follow-ups via a loud/quiet channel pair

Add a second Android channel `messages-quiet` (LOW importance, no sound, no vibration). Server picks per push:

- Loud path (`messages`): recipient has no `message` push for this cluster sent since their `last_read_message_at`, and no `message` push sent within `COALESCE_WINDOW` (proposed 120s, tunable constant in the migration).
- Quiet path (`messages-quiet`): otherwise, i.e. this is a follow-up in an unread burst. Same `tag`, body rolls up to latest preview or "N new messages" (Decision 3). Shade updates visually without buzzing.

Why a channel, not a flag: on Android the buzz comes from the channel importance and vibration pattern, and Expo exposes no per-message vibration override. A LOW channel is the documented quiet-update mechanism.

Why time plus watermark, not time alone: pure time windows misfire right after the user catches up (first message after reading would stay quiet). Gating on `sent_at > last_read_message_at` resets the burst on read, so the next new message after `mark_cluster_read` buzzes again.

Mentions bypass: `mention` type keeps the `mentions` HIGH channel and never routes to quiet, even inside a burst. Users who mute the author already get nothing (`0200` mute guard, kept).

### 3. Body roll-up for merged bursts

When a follow-up merges (queued row exists) or goes quiet, body should not just show the latest line out of context. Proposed:

- If merging into an existing `queued` row for same user plus cluster: update that row in place to `body = "<latest preview>"` and increment a count in `data` (e.g. `data.count`, `data.latestMessageId`). Title stays `<cluster or first sender>`, or switch title to cluster name when count > 1 if cheap (needs cluster name lookup; keep sender title for v1 to avoid extra joins).
- If no queued row but a recent `sent` row exists (already buzzed): insert a new `messages-quiet` row with the latest preview and same tag. Shade replaces visually, quietly.

Keep v1 simple: latest preview plus count. No "3 messages from 2 people" aggregation across senders in v1 unless the count field proves trivial in testing.

### 4. Keep foreground suppression per-room, do not expand to whole app

Stabigail asks for "no vibration when the app is open". Expanding suppression to all foreground pushes would also silence other clusters while browsing home, which breaks the "buzz once per burst" promise. Keep `push-suppress.ts` semantics: only the open room is banner-free. The burst fix already removes the nonstop buzzing that motivated the request. Revisit only if users still complain after bundling ships.

### 5. Ship in two slices

- Slice A (visual, low risk): `tag`/`collapseId`/`threadId` in `send-push` only. Shade goes from N rows to 1 updating row. Still buzzes per message, but compact.
- Slice B (quiet, the actual buzz fix): migration with `messages-quiet` channel, coalesce window, watermark reset, plus client channel creation. This is the Discord behavior.

Slice A can roll out alone if Slice B needs tuning.

## Server changes (new migration, e.g. `02XX_chat_push_bundling.sql`)

1. Alter `push_outbox` channel check to include `messages-quiet`.
2. Rewrite `fan_out_push_for_message()` (live body is `0200`):
   - Keep all existing gates (unlocked cluster, member, not author, not mentioned-everyone or mentioned, not muted, `notification_allowed`, account active).
   - Add per-recipient burst check inside the insert select. For each candidate recipient, look up:
     - `last_read_message_at` for that user plus cluster.
     - Most recent `push_outbox` row for same user plus cluster plus `type = message` with `status in (queued, sending, sent)` ordered by `created_at desc`.
   - Case queued exists for same cluster (worker has not picked it up): do not insert a second row. Instead update the queued row: `body = NEW preview`, `data = data || {count: +1, latestMessageId: NEW.id}`, `channel = messages-quiet` if the existing row already buzzed or window elapsed logic says quiet (define: first row of burst stays `messages`, merged updates stay whatever the first row was; simplest is keep original channel so exactly one buzz per burst).
   - Case no queued row but recent sent within window and after last read: insert with `channel = messages-quiet`.
   - Case else: insert with `channel = messages`.
   - Proposed `COALESCE_WINDOW = 120 seconds` as a migration constant with a comment. Tune after dogfooding (60-180s range).
   - Keep the single `wake_push_worker()` advisory-lock call.
   - Revoke execute from `public, anon, authenticated` (same as `0200:283`).
3. Update `claim_push_notifications` return to include `channel` (already does per `0100:104-112` plus per-token rework in `0102`). Confirm the Edge Function reads it (it does). No RPC signature break.
4. Regenerate `src/lib/database.types.ts` via the repo flow (no codegen script; generate from schema per AGENTS.md) and run `node mobile/scripts/sync-db-types.mjs --check`.

## Edge Function changes (`supabase/functions/send-push/index.ts`)

1. Extend `ClaimedPush` with `channel` already present; derive per message:
   - `channelId = push.channel` (now includes `messages-quiet`).
   - If `push.data.kind === message` and `push.data.clusterId` is a non-empty string: `tag = "cluster-" + clusterId`, `collapseId = tag`, `threadId = tag` (iOS grouping, harmless on Android).
   - Else: no tag fields (all other types unchanged).
2. Keep `sound: default` (iOS semantics; Android sound stays channel-driven).
3. No auth, retry, or receipt logic change. `DeviceNotRegistered` cleanup unchanged.
4. Slice A can be just this file plus no migration (tag on `messages` channel only). Slice B adds the quiet channel value flowing through the same code path.

## Client changes (`mobile/`)

1. `mobile/src/lib/push.ts:46-79`: create `messages-quiet` channel alongside existing ones:
   - `name: Messages (quiet updates)`, `description: Quiet follow-ups in an active chat burst`, LOW importance (`AndroidImportance.LOW`), no sound (`sound: undefined` or omitted), `vibrationPattern: []` or `null`, same PRIVATE lockscreen visibility as `messages`.
   - Must ship before or with the server migration that emits that channel value, else pushes to a missing channel are dropped. Order: client release first, then enable server quiet path (feature flag by channel allowlist or just deploy order with a short gap; preview builds used for verification).
2. No change to `setNotificationHandler`, `push-suppress.ts`, `clearClusterPushNotifications`, or `notification-routing.ts`. Tap target stays room via `pushDataToHref` (`notification-routing.ts:59-64`); quiet updates carry the latest `messageId`, which is fine.
3. `mobile/CHANGELOG.md`: entry under `Unreleased` (no version bump until release, per AGENTS.md mobile versioning). Copy must avoid em dashes and en dashes.

## Edge cases

- Multi-token user: fan-out is per token (`0102` model). Burst check must be per user plus cluster, not per token, or two phones each buzz. Update-all-queued for the user, insert per token consistently (all loud or all quiet per burst event).
- Mention inside a burst: mentioned recipients are excluded from the plain audience already (`0200:256-262`) and get the loud `mention` push. Unchanged.
- `@everyone`: same exclusion path. Unchanged.
- Voice notes, photos, GIFs: preview logic unchanged (`0200:230-237`). Roll-up shows latest preview; count disambiguates.
- Room open during burst: `clearClusterPushNotifications` dismisses shade rows, realtime shows messages, foreground handler suppresses banner. Next burst after `mark_cluster_read` buzzes again via watermark reset. Accepted: a message arriving between shade-clear and watermark advance may still go quiet; window is short and the user is looking at the room.
- Offline device: `collapseId` coalesces in transit; `tag` replaces on delivery. Backlog collapses instead of flooding (matches `PUSH_NOTIFICATIONS_PLAN.md` test 10 expectation).
- Missing `messages-quiet` channel on old builds: pushes dropped silently. Mitigate by client-first rollout and keeping Slice A (tag on loud channel) as fallback.
- Different clusters bursting simultaneously: tags differ per cluster, so two rows (one per cluster) is correct. No cross-cluster merging.
- Restricted accounts, muted authors, prefs-off: existing guards run before burst logic, so quiet path never revives a push that should not exist.
- Lock screen privacy: `messages-quiet` mirrors `messages` PRIVATE visibility.

## Tests

- Integration (`tests/integration/push.test.ts`, extend; requires `supabase start` on a fresh `supabase db reset` with no demo seed per AGENTS.md):
  - Burst merge: two plain messages in quick succession to one recipient produce 1 queued row (or 1 loud plus 1 quiet depending on claim timing; assert at most 1 loud). Body reflects latest preview, `data.count = 2`.
  - Quiet window: after a `sent` row within window, next message inserts `messages-quiet`.
  - Watermark reset: after `mark_cluster_read`, next message inserts loud `messages` again.
  - Mention bypass: mention inside a burst still inserts loud `mentions` row.
  - Mute, prefs-off, author-excluded, non-member: unchanged (existing tests keep passing).
  - Multi-token: two tokens, one burst, both tokens agree on loud vs quiet.
  - Channel constraint accepts `messages-quiet`.
- Edge Function: unit-level check of the message mapper (tag format, collapseId, threadId, channelId passthrough, non-message types untouched). Follow existing function test patterns if present; otherwise at least a mapper test colocated with the function.
- Mobile unit (`mobile/` Vitest): channel setup includes `messages-quiet` with LOW importance and no vibration; `push-suppress` tests unchanged.
- Manual on Android preview build (not Expo Go; push is a no-op there):
  1. Kill app, send 5 messages in 30s from another member: shade shows 1 row, phone buzzes once, body shows latest.
  2. Same but with app on home (foreground, not in room): same single-buzz behavior.
  3. Open room mid-burst: shade row for that cluster clears, no banner for its pushes while open, timeline live.
  4. Send one more message after reading: buzzes again once.
  5. Mention during burst: loud mention arrives even though plain follow-ups are quiet.
  6. Two clusters bursting: two rows, one per cluster, each buzzes at most once per window.
- Gates per AGENTS.md: `npm run lint`, `npm run test:coverage` (do not lower thresholds), `npm run build`, `supabase db reset` plus `npm run test:integration` (migration changed), `node mobile/scripts/sync-db-types.mjs --check` if synced files changed, `mobile/CHANGELOG.md` entry.

## Acceptance

- 5-message 30-second burst to a backgrounded device yields 1 shade row and 1 buzz, not 5 rows and 5 buzzes.
- Follow-up preview updates the same row quietly within the window.
- First message after opening the room (read) buzzes again.
- Mentions still buzz loudly inside bursts. Mutes, prefs-off, and author exclusion unchanged.
- Two-cluster bursts produce two rows, not one merged row and not N rows.
- `lint`, unit plus integration suites, and `build` pass. CHANGELOG entry present.

## Work order

1. Slice A: `send-push` tag/collapse/thread mapping for `message` pushes. Verify single updating row on Android (still N buzzes; expected).
2. Migration: channel check plus `fan_out_push_for_message` burst logic with `COALESCE_WINDOW` and watermark reset. Regen db types, sync check.
3. Client: `messages-quiet` channel in `push.ts` plus CHANGELOG entry. Client release before enabling quiet path.
4. Integration tests for merge, quiet window, watermark reset, mention bypass, multi-token.
5. Manual Android matrix above on a preview build. Tune window (60-180s) from feel.
6. Full gates: lint, coverage, build, integration on fresh reset.

## Rollout notes

- Migrations apply forward only on merge to `develop` (staging) then `develop` to `main` (production). Feature branches never apply directly. `send-push` deploys with the migration train per `docs/TECHNICAL.md` CI notes.
- Quiet-path gate: `0202` adds `push_settings.bundling_enabled` (default false). The migration is safe to apply at any time: with the flag off, bursts merge into one loud row but nothing emits `messages-quiet`. Flip the flag only after the client release with the quiet channel is out, else old builds drop quiet follow-ups silently (Android discards pushes for unknown channels). Staging verification flips it on deliberately.
- Client-first ordering for the new channel, then the flag. Slice A has no ordering constraint.
- If quiet updates ever drop on old builds, they degrade to missing follow-up rows (timeline still live via realtime). Loud first push always uses the pre-existing `messages` channel.

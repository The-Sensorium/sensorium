# Push Notifications Plan — Sensorium Mobile

Goal: replace the in-app Notifications tab (a web-app workaround) with proper
OS-level push on iOS + Android, then shrink or remove the tab.

## 0. Where things stand

Android push is built and verified locally end to end (this doc's phases 1-4,
minus the Notifications-tab decision in phase 5). Status of each piece:

Done and merged-ready (feature branch `feat/push-client-hardening`):
- `supabase/migrations/0094_push_tokens.sql` — owner-scoped `push_tokens`
  table (RLS + grants, mirrors `user_mutes`); `0097` adds the owner UPDATE
  policy + updated-at trigger the registration upsert needs.
- `mobile/src/lib/push.ts` — registration on sign-in, unregister on sign-out,
  Android channels (messages/mentions/invites/governance), no native
  re-prompt after denial, token refresh on foreground, web/Expo-Go guards,
  badge sync, warm-tap routing + `getLaunchPushData()` for cold-start taps.
- `expo-notifications` installed and configured in `mobile/app.json` with the
  notification icon (`assets/notification_icon.png`, cream `#fff8f6` tint).
- `supabase/migrations/0100_push_outbox.sql` — `push_outbox` queue, AFTER
  INSERT trigger on `notifications` that fans out through the per-cluster
  Settings prefs (`notification_allowed`), account-active check, and token
  presence; claim/mark/recovery RPCs; pg_cron pump (`push-pump` every minute,
  `push-recover` every 5). Per-token delivery model.
- `supabase/migrations/0102_push_outbox_per_token.sql` — one outbox row per
  device token (fixes duplicate re-sends and stranded rows for multi-token
  users); claim no longer joins `push_tokens`.
- `supabase/migrations/0101_email_outbox_retry.sql` — same retry fix for the
  pre-existing email outbox (`claim_outbound_emails` re-offers failed rows).
- `supabase/functions/send-push/` — Edge Function worker mirroring
  `send-emails`: claims batches, POSTs to Expo Push API (chunked at 100),
  deletes `DeviceNotRegistered` tokens, marks rows sent/failed/abandoned.
  Registered in `supabase/config.toml` with `verify_jwt = false`.
- `mobile/src/lib/notification-routing.ts` — shared tap-routing (in-app +
  push agree on destinations; `cluster_formed` → introductions,
  `replacement` → votes).
- Integration tests `tests/integration/push.test.ts` (prefs gating, per-token
  fan-out, dead-token isolation, claim/mark/recovery, RLS) and the email
  retry test in `tests/integration/emails.test.ts`.
- `scripts/push-local.ps1` — local-only helper that re-wires
  `push_settings.edge_url/secret/enabled` and starts the worker after every
  `supabase db reset` (a reset disables the pump by design).

Still open:
- **Cloud deploy** of the function + migrations + `push_settings` seed (see
  §8). Nothing push-related is live outside a local stack yet.
- iOS APNs credentials + build (not started; Android-only scope so far).
- Phase 5 Notifications-tab decision (slim vs remove) — deferred until push is
  live with real devices.
- Foreground duplicate-alert suppression when the user is already on the
  relevant screen (phase 5.1) — low-value UX polish, deferred.

## 1. Decisions needed before code (owners)

> The decisions below and phases in §2-§7 were made and executed on the
> `feat/push-client-hardening` branch (Android); they are kept as the design
> record. The open work for taking push to users is §8 (cloud deploy) and the
> iOS/Notifications-tab items listed in §0.

1. **EAS account + project**: who owns the Expo account/org? Dev builds and
   push credentials live there per environment (dev/staging/prod).
2. **Sender identity**: pushes come from Expo Push Service using our FCM/APNs
   creds. Android needs a Firebase project (google-services.json);
   iOS needs an APNs key (.p8) or cert. Who generates and stores these?
3. **Scope of v1**: all notification types, or start with high-value ones
   (mentions, invitations, cluster_formed, signal_new) and add the rest later?
4. **Tab fate**: full removal (4 tabs) vs slim read-only activity list.
   Recommendation: slim list first (dismissed pushes still need a home),
   removal only if data shows nobody opens it.
5. **Badge policy**: app-icon badge = total unread (matches `useUnreadCount`),
   cleared on opening the app. Confirm.

## 2. Phase 1 — EAS dev builds (prerequisite for everything)

Why: Expo Go cannot receive Android remote pushes, period. All push work
below must run on a dev build on a physical device.

1. `npm install -g eas-cli && eas login` (owner account from §1).
2. `cd mobile && eas init` — links `online.thesensorium.app` identifiers
   (already set in `app.json` for both platforms).
3. Add `developmentClient: true` build profile usage (already in `eas.json`
   `development` profile) and run `eas build --profile development --platform all`.
4. Android: create Firebase project → add app (`online.thesensorium.app`) →
   download `google-services.json` → `eas credentials` (or place at
   `mobile/google-services.json`, gitignored) → rebuild.
5. iOS: Apple Developer account → APNs Auth Key (.p8, Key ID, Team ID) →
   `eas credentials` → rebuild. Needs a Mac or EAS cloud build + TestFlight/
   direct install for device testing.
6. Install both builds on test phones. Run the app via `npx expo start --dev-client`.
7. Acceptance: app launches on both physical devices from the dev builds.

Effort: 1–3 days (mostly credentials + Apple process + build queues).

## 3. Phase 2 — Client registration hardening (`mobile/src/lib/push.ts`)

Already registered on sign-in; harden it:

1. **Permission UX**: before the OS prompt, show one in-app explainer sheet
   ("Get notified for mentions, invites, signals") with Not now / Enable.
   Never re-prompt natively after a denial — deep-link to system settings
   instead (`Linking.openSettings()`).
2. **Android channels** (`Notifications.setNotificationChannelAsync`):
   `messages` (default importance), `mentions` (high), `invites` (high),
   `governance` (default). Channel per category in §5 payload.
3. **Token refresh**: re-register on `appState` active (cheap upsert) so
   rotated ExpoPushTokens never go stale.
4. **Logout**: keep `unregisterPushToken` (already wired in `app-providers.tsx`).
5. **Web guard**: skip registration on `Platform.OS === 'web'` (currently it
   attempts and warns — harmless but noisy).
6. Acceptance: token row appears in `push_tokens` after enabling; disappears
   after sign-out; denial path never crashes and never re-prompts natively.

Effort: 2–3 days incl. device testing.

## 4. Phase 3 — Server fan-out (the big piece)

Design constraints (mirror the email pipeline in `docs/EMAIL_NOTIFICATIONS_APPEALS_PLAN.md`):
- Never send from the browser. DB is the source of truth.
- Respect per-cluster prefs (`notification_allowed` read-time gating already
  exists — reuse it at send time).
- Never notify restricted accounts or about content the recipient can't see.
- One row per delivery; retries with backoff; dead-letter after N attempts.

Proposed shape (new work, follows repo migration rules):

1. **Migration `0097_push_outbox.sql`**: `push_outbox(id, user_id, type,
   title, body, data jsonb, status, attempts, next_attempt_at, created_at)`
   with RLS deny-all for client roles; grants to `service_role` only.
2. **Enqueue**: a single `queue_push_notification()` PL/pgSQL function called
   from the same places that create `notifications` rows today (chat mention,
   reaction, vote events, invitations, signals, posts, cluster_formed). It
   checks `notification_allowed` prefs + account active + "has at least one
   push token" before inserting (keeps the outbox lean).
3. **Sender**: extend the existing `send-emails` Edge Function pattern with a
   `send-push` function (or one worker handling both outboxes): claim a batch
   (`status sent/failed`, `recover_stuck_sending` equivalent), POST to
   `https://exp.host/--/api/v2/push/send` with the stored ExpoPushToken,
   per-message `channelId` (§2), `badge` = unread count, `data` = deep-link
   payload (§5). Secrets (`EXPO_ACCESS_TOKEN` optional) live in the function
   env, never in the DB or client.
4. **Schedule**: pg_cron every minute (same mechanism as the email pump).
5. **Token hygiene**: on Expo `DeviceNotRegistered` responses, delete that
   `push_tokens` row so the table doesn't rot.
6. Acceptance: with two dev-build devices, every v1 type (§1.3) arrives in
   foreground, background, and killed states; prefs-off types never arrive;
   restricted test account receives nothing.

Effort: 1–2 weeks (migration + function + cron + RLS/integration tests per
AGENTS.md pre-push rules).

## 5. Phase 4 — Client receive + routing

1. **Foreground**: `setNotificationHandler` already shows the alert
   (`push.ts`). Keep, but suppress the alert when the user is already looking
   at the relevant screen (e.g. incoming chat message while the room is open —
   check current route before alerting).
2. **Tap routing**: `addNotificationResponseReceivedListener` →
   `router.push(mobileTarget(data))`. Reuse the mapping already built in
   `mobile/app/(app)/notifications.tsx` (`mobileTarget`) — extract it to
   `mobile/src/lib/notification-routing.ts` and import it in both places.
3. **Badge**: `setBadgeCountAsync(unread)` whenever `useUnreadCount` changes
   (in `(app)/_layout.tsx`); clear on sign-out.
4. **Data contract** (server → client, keep stable): `{ kind, clusterId?,
   postId?, signalId?, voteId? }`. Version it (`v: 1`); unknown kinds open Home.
5. Acceptance: tap on a mention push opens the exact room; invite push opens
   Home banner; killed-state taps cold-start into the right screen.

Effort: 3–5 days.

## 6. Phase 5 — What happens to the Notifications tab

Do this only after §3–§4 are live in staging with real devices.

Option A (recommended): slim it to a read-only activity list.
- Remove mark-all-read CTA prominence, keep list + tap routing (shared
  `notification-routing.ts`).
- Rename tab? Keep "Notifications" label + bell; badge stays as backup signal.

Option B: full removal.
- Delete `mobile/app/(app)/notifications.tsx`, drop the tab from
  `(app)/_layout.tsx` (4 tabs), remove `useUnreadCount` badge + channel?
  (keep the realtime channel — Home invitations + mark-read depend on it),
  keep `notificationTarget`/`mobileTarget` for push routing.
- `settings/reports` link and ReportModal "View my reports" unaffected.

Migration note: neither option touches the backend; `notifications` table and
prefs stay (prefs now gate pushes — they become MORE important, surface them
in Settings as "Push preferences").

Effort: 1–2 days (A) / 2–3 days (B, more test fallout).

## 7. Phase 6 — Test matrix (staging, two physical devices)

| # | Scenario | Expect |
|---|----------|--------|
| 1 | Mention while app killed | Push arrives, tap opens room |
| 2 | Chat message, room open | No duplicate alert (suppressed), timeline updates |
| 3 | Invite while backgrounded | Push arrives, tap lands on Home banner |
| 4 | Pref off for reactions | Like arrives silently (no push), still in center |
| 5 | Restricted account | Zero pushes, zero center entries |
| 6 | Sign out → push sent | Nothing arrives (token deleted) |
| 7 | iOS + Android parity | Same payload renders correctly on both |
| 8 | Klipy/GIF, images | Media pushes show text fallback, never crash on tap |
| 9 | 30-day cooldown leave/rejoin | No stale cluster pushes after leaving |
| 10 | Airplane-mode backlog | Backlog collapses to latest per thread, no flood |

## 8. Rollout + ops

Push is only a local feature until the function + migrations run against the
hosted Supabase projects. Do this before wiring Daily calling. Order mirrors
the email pipeline (`send-emails` + `email_settings`).

1. **Deploy (per env)**: merging to `develop` applies the push migrations
   (`0094`, `0097`, `0100`, `0101`, `0102`) to staging via CI; production gets
   them through the `develop` → `main` release (`npm run check:release` must
   pass first per AGENTS.md). No `db reset` involved — migrations apply
   forward only; never re-seed a hosted `push_settings` row by re-running the
   migration.
2. **Deploy the function**: `supabase functions deploy send-push` to the hosted
   project, with `SENSORIUM_PUSH_SECRET` set in its environment (a long random
   string). Same for `send-emails` if not already deployed.
3. **Seed `push_settings`** (single row, `id = true`): `edge_url` =
   `https://<project-ref>.supabase.co/functions/v1/send-push`, `secret` = the
   value from step 2, `enabled` = true. Wire this through the CI migration
   workflow exactly like `email_settings` (see `docs/TECHNICAL.md`).
4. **Verify against staging**: from a phone, a web member mentions a mobile
   user → push arrives. Confirm `push_outbox` rows go `queued → sending →
   sent` and tap cold-starts to the room.
5. **Monitor**: outbox `failed`/`abandoned` counts, Expo push receipts
   (`DeviceNotRegistered` = token cleanup working), token-table growth,
   per-type volume (watch mention-spam).
6. **Cost note**: Expo Push Service is free within generous limits; FCM/APNs
   free.


## 9. Total effort estimate

| Phase | Time (1 dev) |
|---|---|
| 1 Dev builds + credentials | 1–3 days |
| 2 Client hardening | 2–3 days |
| 3 Server fan-out | 1–2 weeks |
| 4 Receive + routing | 3–5 days |
| 5 Tab slim/removal | 1–3 days |
| 6 Testing | 3–5 days |
| **Total** | **4–7 weeks** |

Biggest risks: Apple credential/TestFlight friction (§1), RLS-gated fan-out
edge cases (§3 — reuse the notification test suite), Expo Go confusion during
development (push code paths must no-op cleanly in Go — already handled in
`push.ts`).

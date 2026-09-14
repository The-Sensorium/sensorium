# Cluster Calls Plan — Audio/Video in Sensorium

Goal: let members of a cluster start and join an audio/video call from inside the
room, on both the web SPA and the Expo app, with the same shared room state,
ringing, and membership gating as the rest of the cluster experience.

## 0. Provider decision (made)

**LiveKit**, used on both platforms.

- Shared backend: one token-minting Edge Function serves web + mobile.
- Own-the-infra matches the project's Supabase/RLS philosophy and avoids
  per-minute metering.
- `@livekit/components-react` for the web SPA; `@livekit/react-native` for the
  Expo app — same SDK family, one mental model.
- Trade-off: on React Native there is no prebuilt components library, so the
  in-call UI is hand-built. Accept it.

Start on **LiveKit Cloud** (zero self-host ops) with a path to self-host the
`livekit-server` later if usage justifies it. Daily.co and Twilio Video are
rejected: Daily's React Native story is weak, and Twilio Video was shut down.

## 1. How it fits the existing stack

Already in place and reused, not rebuilt:

- `usePresence(clusterId)` (`src/features/realtime.ts`) tracks who is online in
  a cluster; "in a call" becomes an extension of that presence signal so members
  can see who joined.
- `useClusterChannel` already delivers realtime events per cluster; add a
  `calls` table subscription for "ringing" and "status changed" so the UI reacts
  without polling.
- Database is the source of truth; privileged lookup/mutation live in
  `security definer` RPCs guarded by grants; Edge Functions are used only where
  secrets are required (token signing), mirroring `send-push`/`send-emails`.
- `src/lib/database.types.ts` + `mobile/src/lib/database.types.ts` are kept in
  sync after the migration (no codegen script).

## 2. Decisions to confirm (owners)

1. **Media scope of v1**: audio-first, audio+video, or video-toggle per call?
   Recommendation: **audio+video with per-participant toggles** (default video
   off on join mobile, on for desktop). Confirm default mic/cam states.
2. **Ringing model**: group call = anyone can start; other online members get an
   in-app "X is calling" banner (nudge to join), not a hard OS push in v1. Do we
   reuse the existing push pipeline (§2.4 of `PUSH_NOTIFICATIONS_PLAN.md`) to
   ring backgrounded mobile users? Recommendation: **no in v1**, only in-app
   ringing via realtime; add push-ringing as a follow-up.
3. **Max participants per call**: LiveKit SFU handles far more than clusters
   need; confirm a cap (recommend 8) so the calling UI stays simple.
4. **Call history / recording**: not in v1. No recording, no persisted transcript.
   (Recording needs the SFU agent service + storage scoping decisions.)
5. **Presence→call coupling**: is "joined the room" enough to show in-call state,
   or should being in-call be a distinct Opted-in signal? Recommendation: in-call
   is a **distinct** state (row in `call_participants` + LiveKit room), so
   "online in room" and "actually on the call" never conflate.

## 3. Architecture

```
Web SPA (components-react)  ──┐
                              ├─► LiveKit room (cluster:<id>:<callId>)   [media plane]
Expo app (react-native)  ─────┘           ▲
                                        token
┌───────────────────────────────┐    ┌───────────────────────────┐
│ Edge Function create-call-token│──►│ LiveKit token: identity,  │
│ (service role, verifies JWT,   │    │ room, grants, TTL         │
│  checks cluster membership)    │    └───────────────────────────┘
└───────────────────────────────┘
        ▲ calls row (RLS: members)
┌───────────────────────────────┐
│ Postgres: calls               │  status band: id_ring / active / ended
│  + call_participants          │  ringing via realtime postgres_changes
└───────────────────────────────┘
```

- The **media plane** is LiveKit. The **signal/state plane** is Postgres +
  Supabase Realtime. The only thing LiveKit needs from us is a signed token.
- Room name is **`cluster:<clusterId>:<callId>`** — unique per call, so a
  lingering connection from a previous call in the same cluster can't leak into
  a new one. Token identity is the caller's
  `user.id` (from the auth JWT), validated against active membership.

## 4. Phase 1 — Environment + LiveKit provisioning

1. **LiveKit Cloud**: create project; note `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
   `LIVEKIT_API_SECRET`.
2. **Env wiring**: the client needs **no** LiveKit env — `create-call-token`
   returns the wss URL alongside the token. Only the Edge Function holds secrets:
   `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in the function env
   (`supabase secrets set` for hosted, `supabase/functions/.env` locally); never
   in the client or the DB.
3. **Install**:
   - Web: `npm i @livekit/components-react @livekit/client`
   - Mobile: `npm i @livekit/react-native @livekit/react-native-webrtc`
   - Confirm `@livekit/react-native` works with Expo SDK 57 / RN 0.86 +
     `expo-dev-client` (requires a native dev build for the WebRTC module).
4. **Native config (mobile)**:
   - iOS `Info.plist`: `NSCameraUsageDescription`,
     `NSMicrophoneUsageDescription`.
   - Android `AndroidManifest.xml`: `CAMERA`, `RECORD_AUDIO`, `INTERNET` +
     `MODIFY_AUDIO_SETTINGS`/`BLUETOOTH` for audio routing.
   - App config added to the existing dev-build flow (`expo-dev-client` already
     in `mobile/app.json`).
5. Acceptance: both apps can obtain a signed token and join a manually-created
   `cluster:<id>:<callId>` test room; two devices see each other.

## 5. Phase 2 — Backend: membership-gated token + call state

New migrations (order-dependent, follow the `NNNN_` flat scheme; **never edit an
applied migration — add new ones**):

1. **`01xx_cluster_calls.sql`** — `calls` and `call_participants`:
   - `calls(id uuid pk default gen_random_uuid(), cluster_id uuid not null,
     initiated_by uuid not null, status text not null default 'ringing'
     check in ('ringing','active','ended'), created_at timestamptz, ended_at
     timestamptz, expires_at timestamptz not null default now() + interval
     '30 minutes')`.
   - `call_participants(call_id, user_id, joined_at, left_at)`.
   - **RLS enabled**: read `calls`/`call_participants` only for active members
     of that cluster (mirror the existing member-read predicate on `messages`);
     no client deltas — all writes via RPC.
   - Index: `(cluster_id, status)` for active-call lookups; FK to
     `cluster_members`.
2. **`01xx_cluster_calls_rpc.sql`** — `security definer` functions:
   - `start_call(p_cluster_id)` — verifies caller is an active member and the
     cluster is not ended; inserts a `calls` row (`status='ringing'`) idempotently
     (only one active call per cluster), inserts the initiator participant,
     returns the `call_id`. Guarded by grants (only `authenticated`).
   - `join_call(p_call_id)` — verifies membership; inserts/re-activates the
     participant row. Rejects after `status='ended'` or past `expires_at`.
   - `leave_call(p_call_id)` — marks only the caller's participant row left; the
     call stays live for everyone else. When the last open participant leaves it
     sets `status='ended'`, `ended_at` so the cluster's live-call banner clears
     and a fresh call can start.
   - `end_call(p_call_id)` — force-ends the whole call (sets `status='ended'`,
     marks all open participants left). Kept in the DB but not used by the client
     in v1; `leave_call` is the hang-up path.
   - `end_expired_calls()` — cron-only; ends every live call past `expires_at`
     and releases its participants. `call-expire` runs every minute (cron
     `0039` idempotent pattern). The 30-minute cap protects the free tier and
     clears abandoned calls (`expires_at` is per call, not per participant).
   - `release_member_calls()` — `AFTER UPDATE` trigger on `cluster_members`:
     when a member departs (leave_cluster, account deletion, ban), close their
     open `call_participants` rows for that cluster and end any call left with
     no open participants. Keeps a departed member from holding a call seat.

   Write-path gating lives in these RPCs, not RLS policies, so membership checks
   and status transitions are atomic — consistent with existing governance RPCs.
3. **Realtime**: publish `INSERT`/`UPDATE` on `calls` (and `call_participants`)
   for members via the existing replay policy approach; the client subscribes
   through `useClusterChannel` (add a `calls` branch) to drive ringing/banner UI
   and to know when to auto-join.
4. **Edge Function** `supabase/functions/create-call-token/`:
   - Method POST. Client sends `{ call_id }` + JWT.
   - Verify the Supabase access JWT (Supabase edge runtime handles this; run with
     `verify_jwt` behavior — see `send-push`/`send-emails` in `supabase/config.toml`).
   - With a service-role client, re-check membership, that the account is active
     (`is_account_active`), that the call is not `ended`/expired, and that the
     cluster is not ended (replicate the SELECT-policy predicate — the function
     bypasses RLS, so it must re-assert access by hand).
   - Mint a LiveKit access token: room = `cluster:<clusterId>:<callId>`, identity = caller
     id, name = display name, `canPublishSources` = camera + microphone (no screen
     share), TTL short (e.g. 10 min). Return `{ token, url }`.
   - Secrets only from function env.
5. **`database.types.ts`**: regenerate both web and mobile copies from the new
   schema.
6. Acceptance: an RLS block test (`tests/integration/cluster_calls.test.ts`) proves
   a non-member cannot start/join/read; a member can; a token is refused after the
   call ends; grants are scoped to `authenticated`.

## 6. Phase 3 — Web feature module + UI (`src/features/cluster-calls.ts` + components)

Follow the feature-module rule: components never talk to Supabase or LiveKit
directly; they call hooks in the feature module that wrap TanStack Query.

1. **`useActiveCall(clusterId)`**: query `calls` for the cluster's non-ended call;
   invalidated by the `calls` realtime branch in `useClusterChannel`.
2. **`useStartCall`, `useJoinCall`, `useEndCall`**: mutations calling the RPCs;
   invalidate `['active-call', clusterId]` on success.
3. **`useCallToken(callId)`**: query that calls the `create-call-token` function
   when the user opts in to a call.
4. **Hooks wrapper** around LiveKit: connect/disconnect to the room, expose
   local + remote tracks, mute/unmute, cam on/off, participant count. Gate
   rendering behind "user clicked join" (auto-join ringers only if §2 confirmed;
   default = confirm dialog).
5. **UI**:
   - Room header: telephone/== join affordance + the "who's in a call" avatars
     (from `call_participants`).
   - In-call overlay (fixed): local preview tile, remote tiles, controls bar
     (mic/cam/hang-up — **no screen share**). The token grants only `camera` +
     `microphone` via `canPublishSources`, so LiveKit's control bar omits the
     screen-share control and the media plane rejects it. Minimal, token-safe
     classes per `docs/DESIGN.md`.
   - Ringing: banner near the composer "X started a call — Join / Decline"
     driven by the realtime `calls` insert.
   - **Start call** lives in the composer's room-actions menu (with send image /
     GIF / signal), not in the room header.
6. Acceptance: two web tabs in one cluster join, see/hear each other, mute/cam
   toggle and leave; third member sees the live call without joining (attempt to
   fetch a token is only made on explicit join).

## 7. Phase 4 — Mobile (Expo) integration

1. **Permissions**: camera/mic permission prompts via `expo-permissions`;
   explainer sheet before the OS prompt on first call (mirrors push UX).
2. **Call screen**: `mobile/app/(app)/clusters/[id]/call.tsx` route (or overlay)
   using `@livekit/react-native`. Hand-built tiles + controls; reuse the same
   `start/join/end` RPCs and token fetch against the shared Edge Function.
3. **LiveKit RN specifics**: must run in a native dev build (not Expo Go) — a dev
   build is already produced for push; the call route is tested on the same
   build. Handle app backgrounding (pause/reconnect the room) and audio session
   routing.
4. **Shared constants**: room-name builder, provider URL, token-fetch helper —
   keep in a small shared file or mirror in `mobile/src/lib/` (no cross-package
   import today). Note which in §log.
5. Acceptance: web↔mobile call works; mobile↔mobile works; both directions
   toggle mic/cam and leave cleanly.

## 8. Phase 5 — Rollout + ops

1. **Order mirrors push**: migrations apply forward on merge to `develop`
   (staging) and through the `develop` → `main` release (production). Run
   `npm run check:release` before the release PR.
2. **Deploy the functions**:
   - `supabase functions deploy create-call-token` to staging then prod.
   - `supabase secrets set LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...`
     on the hosted project(s).
3. **Config**: none on the client. `create-call-token` returns the `LIVEKIT_URL`
   in the token response, so the SPA and app read it from there.
4. **`supabase stop && supabase start`** after adding the realtime table so the
   Realtime server picks up `calls`/`call_participants` replication (AGENTS.md).
5. **Monitor**: LiveKit Cloud usage dashboard per project; active-call rows in
   staging; refusal log for refused tokens (possible abuse signal → confirm
   membership predicate held); `cron.job` runs for `call-expire` (an expired
   call that never ends means the cron isn't firing).
6. **Self-host path**: only once sustained usage makes Cloud's per-minute cost
   exceed a server + bandwidth bill. See **Appendix A** for the concrete setup.
   No client changes: you only repoint `LIVEKIT_URL`/keys.

## 9. Tests

- **Unit (colocated)**: `src/features/cluster-calls.test.ts` for cache/query
  logic and token-request args (mock the function client); small hook tests as
  today.
- **Integration (`tests/integration/cluster_calls.test.ts`, needs
  `supabase start`)**: RLS read gating, RPC authorization (non-member rejected),
  idempotent single active call, status transition end(stop join), token refused
  after end. Mirrors `push.test.ts` structure.
- **Mobile**: minimal unit for the token-fetch/room-name helpers. Live WebRTC is
  exercised in the manual acceptance matrix, not in CI.
- E2E WebRTC is **out of scope** for Playwright (WebRTC in headless chromium is
  unreliable/slow); cover join-button → token fetch via a mock room instead if
  worthwhile.

## 10. Rollout matrix (manual, two devices + a web tab)

| # | Scenario | Expect |
|---|----------|--------|
| 1 | Desktop starts a call | Ringing banner in room; others see call row |
| 2 | Mobile joins from banner | WebRTC connects web↔mobile both directions |
| 3 | Mute/cam off each side | Control state sticks; no audio/video leak |
| 4 | Third member declines | Stays in room; never fetches a token |
| 5 | A participant leaves | Only they leave; others stay in the call |
| 6 | Leave cluster during call | RPC rejects; call participant marked left |
| 7 | Non-member / ended cluster | Token refused; no calls row readable |
| 8 | Mobile backgrounded | Reconnects on foreground; no stale participant |
| 9 | Last participant leaves | Call ends; banner clears; a fresh call can start |
| 10 | Call hits the 30-min limit | Countdown turns to "time left" at 5 min; clients auto-leave; cron ends any leftovers |

## 11. Total effort estimate

| Phase | Time (1 dev) |
|---|---|
| 1 LiveKit provisioning + native config | 1–2 days |
| 2 Backend migrations + RPC + Edge Function | 1 week |
| 3 Web feature module + UI | 3–5 days |
| 4 Mobile integration | 4–6 days |
| 5 Rollout + ops | 1–2 days |
| 6 Testing | 3–4 days |
| **Total** | **3–4 weeks** |

Biggest risks: React Native WebRTC + Expo SDK 57 compat (§1/§4), permission +
audio-session friction on iOS (§7), and the membership predicate must be re-asserted
inside the token function (RLS is bypassed by service role) (§5).

## Appendix A — Self-hosting LiveKit (alternative to Cloud)

Do this **only when warranted**: Cloud's Build plan is free to 5,000
participant-minutes/month, and Ship is $50/mo. Self-hosting pays off when your
sustained usage is high enough that per-minute billing exceeds the cost of a
server plus bandwidth. Until then, Cloud is cheaper than a VPS you have to
operate. The only code change either way is the three `LIVEKIT_*` values.

### A.1 What you actually run

- **`livekit-server`** (the SFU) — the open-source media server.
- **TURN** — required for participants behind symmetric NAT. `livekit-server`
  has built-in TURN/TLS; enabling it is a config block, but it needs a public
  domain and certificate.
- **TLS termination** — clients connect over `wss://`; put a reverse proxy in
  front or configure LiveKit's own TLS.
- **Redis** — only for multi-node scale. A single node is fine for
  cluster-sized rooms.

Cost is dominated by **bandwidth**, not CPU. Video calls move a lot of data;
budget egress accordingly and prefer a host with cheap/free egress.

### A.2 Minimal single-node setup

1. Provision a VPS with a public IP and a DNS name pointing at it (e.g.
   `calls.thesensorium.online`). Open the firewall:
   - TCP **7880** (signaling, behind the proxy)
   - TCP **443** (wss via the proxy)
   - UDP **50000–60000** (WebRTC media)
   - TCP **5349** + UDP **3478** (TURN — only if you enable it below)
2. Generate an API key/secret pair (any long random strings). LiveKit uses them
   exactly like the Cloud key: `keys: <key>: <secret>` in the config.
3. `livekit.yaml`:

   ```yaml
   port: 7880
   rtc:
     tcp_port: 7881
     port_range_start: 50000
     port_range_end: 60000
     use_external_ip: true
   keys:
     # Replace with a long random key/secret pair.
     APIxxxxxxxxxxxx: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   # Enable only after TLS + DNS are working; needs certs mounted.
   # turn:
   #   enabled: true
   #   domain: calls.thesensorium.online
   #   tls_port: 5349
   ```

4. `docker-compose.yml`:

   ```yaml
   services:
     livekit:
       image: livekit/livekit-server:latest
       command: --config /etc/livekit.yaml
       restart: unless-stopped
       network_mode: host
       volumes:
         - ./livekit.yaml:/etc/livekit.yaml:ro
   ```

   `network_mode: host` keeps the wide UDP media range simple; if you can't use
   host networking, publish the whole UDP range explicitly.

5. TLS with Caddy in front (Caddy gets a cert automatically):

   ```
   calls.thesensorium.online {
     reverse_proxy 127.0.0.1:7880
   }
   ```

6. Verify the server is up:

   ```
   docker compose logs -f livekit        # "starting LiveKit server"
   curl https://calls.thesensorium.online   # API reachable over TLS
   ```

7. **Enable TURN** once TLS works: uncomment the `turn:` block, mount the Caddy
   certs into the container, forward 5349 (TCP/UDP) and 3478 (UDP), and restart.
   Without TURN, some users (corporate networks, strict NAT) won't connect.

### A.3 Point the app at your server

Same three variables, new values — the Edge Function and clients are unchanged:

- **Local** (`supabase/functions/.env`):
  `LIVEKIT_URL=wss://calls.thesensorium.online`, plus the key/secret from A.2.
- **Hosted**:
  `supabase secrets set LIVEKIT_URL=wss://calls.thesensorium.online LIVEKIT_API_KEY=<key> LIVEKIT_API_SECRET=<secret>`
  then redeploy nothing (the function reads env at runtime).

### A.4 When you outgrow one node

- Add **Redis** (`redis: address: redis:6379` in the config) and run multiple
  `livekit-server` instances behind LiveKit's load balancer / your own routing.
- Run nodes in more than one region for lower latency, or accept that far-away
  users traverse to your single region.
- You own upgrades, security patches, certificate renewal, monitoring, and
  metrics now — Cloud bundled all of that into the per-minute rate.

### A.5 Operational checklist (self-host)

- Firewall: signaling + full UDP media range + TURN ports open.
- TLS certificate auto-renewing; `wss://` reachable from a browser and a phone.
- TURN enabled and tested from a restrictive network (phone on cellular data).
- Monitoring/alerts: process up, CPU/bandwidth, active rooms.
- Key/secret rotated and stored in the function env only, never in the client.
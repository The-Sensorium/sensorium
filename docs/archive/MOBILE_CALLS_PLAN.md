# Mobile Calls Plan — Sensorium

Follow-up to `docs/archive/CLUSTER_CALLS_PLAN.md`. The cluster call feature is already
implemented and committed (`feat/cluster-calls`) and verified on web. This doc
covers bringing the **mobile** call experience up to par and getting it onto a
device: UI parity, in-call chat, lifecycle/ringing, pre-join + permissions,
timer/limit verification, and the native build + test matrix.

Audio/video media is LiveKit; state is Postgres + Realtime. Nothing here changes
the backend contract established in `CLUSTER_CALLS_PLAN.md`; it is client work.

## 0. Where things stand

Already implemented on mobile and committed:

- `mobile/app/(app)/cluster/[clusterId]/call.tsx` — call screen: `LiveKitRoom`,
  a hand-built `Stage` (camera tiles via `useTracks` + `VideoTrack`), `Controls`
  (mic/cam/hang-up), guarded `finishCall` → `leave_call`, and the 30-min clock.
- `mobile/src/features/cluster-calls.ts` — `useActiveCall`, `useCall`,
  `useCallParticipants`, `useStartCall`, `useJoinCall`, `useLeaveCall`,
  `useCallToken`, `buildCallRoomName`, `CALL_WARNING_SECONDS`.
- `mobile/app/(app)/cluster/[clusterId]/room.tsx` — ringing banner + **Start a
  call** in the composer (+) menu.
- `mobile/src/features/realtime.ts` — `calls`/`call_participants` invalidation.
- `mobile/app.json` — camera/mic permissions declared.
- Token (`create-call-token`) sets `name` (display name) and camera/mic-only
  grants, so no screen share on any platform.

Known gaps to close:

1. **Route not registered (bug).** `cluster/[clusterId]/call` is missing from
   `mobile/app/(app)/_layout.tsx`'s `<Tabs><Tabs.Screen …/></Tabs>` list (every
   other cluster route is declared with `href: null`). Undeclared routes are
   added as tabs, so the call screen can surface as a stray tab and the tab bar
   isn't suppressed. Fix first.
2. Call UI is bare: single-column camera tiles with no names, no avatars when the
   camera is off, no active-speaker, no participant count, no chat.
3. No pre-join: joining immediately grabs mic/cam with no explainer or toggles.
4. No ringing/accept affordance beyond the in-room banner; no reconnect state.
5. Backgrounding/audio-session behaviour on Android is untested (iOS is not
   supported and out of scope).
6. Timer/limit was implemented but never exercised on a device.

## 1. Decisions to confirm (owners)

1. **Camera default on join**: mobile currently joins **audio-first**
   (`video={false}`). Keep audio-first (recommended: mobile data/battery, and
   matches the web comment "others join audio-first on mobile") or match web and
   turn camera on? Recommendation: keep audio-first, with a prominent camera
   toggle.
2. **In-call chat source**: LiveKit data-channel chat (web-compatible, ephemeral,
   messages appear in the web call's Messages panel) vs. the cluster room chat.
   Recommendation: **LiveKit chat via `useChat`** so cross-platform call chat
   works; the cluster room chat stays its own thing.
3. **Ringing UX**: in-room modal card with Accept/Decline (recommended, no OS
   push ringing in v1, matching `CLUSTER_CALLS_PLAN.md` §2) vs. OS notification
   ringing (needs the push pipeline + a new notification type; out of scope here).
4. **Background call (Android only)**: allow audio to continue while the screen
   is locked (Android audio focus; a foreground service only if needed) vs. treat
   backgrounding as leave. Recommendation: keep audio alive in background;
   full-screen video requires foreground. iOS is not supported.
5. **Decline semantics**: Decline = dismiss locally for this call (does not end
   it for others). Confirm.

## 2. Phase 0 — Router + hygiene (do first)

1. Register the call route in `mobile/app/(app)/_layout.tsx`:
   ```tsx
   <Tabs.Screen
     name="cluster/[clusterId]/call"
     options={{ href: null, animation: 'fade', tabBarStyle: { display: 'none' } }}
   />
   ```
   The call is full-screen, so hide the tab bar for that route.
2. Move `registerGlobals()` out of the screen module if it causes re-invocation
   on remount; call it once at app start (`mobile/src/app-providers.tsx`) so
   hot-reload/remount doesn't re-register WebRTC globals. Verify no double call.
3. Acceptance: running the app shows no stray "call" tab; navigating to the call
   route hides the tab bar; `expo-doctor` clean.

Effort: 0.5 day.

## 3. Phase 1 — Pre-join + permissions

New component `mobile/src/components/room/call/PreJoin.tsx` (rendered inside the
call route before connecting, and from the room's Join/Start actions):

1. **Permission explainer before the OS prompt**: a small sheet ("Calls use your
   mic and camera") with Continue, shown only when permission is `undetermined`.
2. **Permissions**: request via `expo-camera`
   (`Camera.requestCameraPermissionsAsync` /
   `requestMicrophonePermissionsAsync`) — one dependency covers both. If denied,
   show a non-blocking state with an "Open settings" path (`Linking.openSettings`)
   and allow **audio-only join** when only the camera is denied.
3. **Device toggles**: mic on/off and camera on/off, initialised from §1.1
   (audio-first default). Pass the choices into `<LiveKitRoom audio video=…>`.
4. **Participant preview**: skip a live camera preview for v1 (LiveKit RN needs a
   connected room or a manually-created local track); the avatar + name is enough.
5. Wire the room's Start/Join to open PreJoin, then push the call route with the
   chosen mic/cam state as route params.
6. Acceptance: first call shows the explainer once; denying camera still lets the
   user join with audio; toggles carry into the connected call.

Effort: 2–3 days incl. device testing.

## 4. Phase 2 — Call UI parity with web

Replace the bare `Stage` with a proper in-call layout under
`mobile/src/components/room/call/`:

1. **`ParticipantTile.tsx`** — one tile per participant from `useTracks`
   (camera with placeholder) and `useParticipants`:
   - Video when the camera is on (`VideoTrack` from `@livekit/react-native`).
   - Avatar + `participant.name` (the token now sets `name`) when the camera is
     off, using the existing `mobile/src/components/Avatar.tsx`.
   - Active-speaker ring/border via `useSpeakingParticipants` (re-exported by
     `@livekit/react-native`).
   - Muted indicator from `participant.isMicrophoneEnabled`.
2. **`CallGrid.tsx`** — responsive tiles (1 → full, 2 → stacked, 3–4 → 2×2,
   more → scrollable grid). Keep it simple; no LiveKit GridLayout pagination.
3. **`CallControls.tsx`** — mic, camera, chat, hang-up; disable while
   reconnecting; reuse the existing control styling and `theme-tokens` radii.
4. **Header** — "Cluster call", participant count, and the existing countdown
   badge (`formatCallDuration` + `CALL_WARNING_SECONDS`).
5. Use design tokens only (`docs/DESIGN.md`); no new colors.
6. Acceptance: names/avatars show for audio-only members; the speaking tile is
   visibly indicated; tiles reflow for 1/2/3+ participants; controls match the
   app's look.

Effort: 3–4 days.

## 5. Phase 3 — In-call chat

Use LiveKit's data channel so mobile ↔ web in-call chat works and sender names
appear (both read `participant.name`).

1. **`InCallChat.tsx`** — `FlatList` of messages from `useChat()` with sender
   name + body, and an input that calls `send(text)`; auto-scroll to newest;
   respect the keyboard (`KeyboardAvoidingView`).
2. **Toggle** in `CallControls` opens the chat as a bottom sheet (modal) sized to
   ~60% height so it doesn't fight the tiles.
3. **History**: LiveKit chat is ephemeral and not persisted (per LiveKit docs) —
   matches web. Document that in the UI empty state ("Messages show only during
   the call").
4. Acceptance: a message sent on mobile appears in the web call's Messages panel
   and vice versa, with the correct sender name; closing/reopening the sheet
   keeps the session history.

Effort: 2–3 days.

## 6. Phase 4 — Call lifecycle UX

1. **Ringing / accept**: upgrade the in-room call banner to a prominent card with
   **Accept** (opens PreJoin → call) and **Decline** (dismisses locally for this
   call id; does not end it). Track declined ids in component state so the card
   doesn't re-nag on every realtime tick.
2. **Reconnect state**: use `useConnectionState` — show "Reconnecting…" and
   disable controls while `reconnecting`; only `finishCall()` on a real
   `disconnected` (the existing `onDisconnected` path).
3. **Backgrounding / audio session (Android only)**:
   - Rely on LiveKit's audio manager; confirm audio focus/earpiece routing and
     that a locked screen keeps audio. Add
     `android.permission.FOREGROUND_SERVICE` only if a foreground service is
     actually needed.
   - `registerGlobals` stays with the default audio configuration; no iOS
     background modes are added and iOS is not built or tested.
   - Use `AppState` to note foreground/background for the reconnect UI, not to
     tear down the call.
4. **Audio route (optional)**: an earpiece/speaker/bluetooth toggle via
   `AudioSession`/`RNSpeaker` if needed; defer unless testing shows it's wrong.
5. Acceptance: decline doesn't join; a forced network drop shows reconnecting and
   recovers; backgrounding keeps audio; returning to the foreground re-renders
   the grid.

Effort: 2–4 days (largest unknown is Android locked-screen audio behaviour).

## 7. Phase 5 — Timer + limit parity (verify)

1. Already implemented in `call.tsx` (elapsed, warning ≤ 5 min, auto-`finishCall`
   at 0). Verify on device against the server `expires_at`:
   - Start a call; confirm elapsed ticks each second.
   - In Studio, set `calls.expires_at` to ~90 seconds out; confirm the badge turns
     into the error-coloured "N left" and the screen leaves at zero.
2. Confirm the server cron (`call-expire`) ends a call whose client is killed:
   start a call, force-quit, wait past `expires_at`, confirm the call row flips to
   `ended` and the room banner clears on the other device.
3. Note the known divergence: `formatCallDuration` / `CALL_WARNING_SECONDS` are
   duplicated in web and mobile. Acceptable; a shared module can wait.
4. Add a colocated unit test for mobile `formatCallDuration`
   (`mobile/src/components/room/format.test.ts`) mirroring the web test.
5. Acceptance: timer/warning/auto-leave match web; forced-quit cleanup verified.

Effort: 1 day.

## 8. Phase 6 — Native build + device test plan (Android only)

WebRTC native modules don't run in Expo Go; a **development build** is required
(EAS config already has a `development` profile in `mobile/eas.json`). iOS is
not supported and is out of scope for this plan.

1. Build/install the dev client (first time may take a while):
   ```
   cd mobile
   eas build --profile development --platform android
   npx expo start --dev-client
   ```
   Install the APK on two physical Android devices. Permissions are already
   declared in `mobile/app.json`.
2. Two physical Android devices + a web tab, signed in as three members of one
   cluster.
3. Test matrix:

   | # | Scenario | Expect |
   |---|----------|--------|
   | 1 | Mobile starts a call from the + menu | PreJoin sheet, then connects audio-first |
   | 2 | Web joins | Both directions audio; names on tiles |
   | 3 | Toggle camera on mobile | Web sees mobile video and vice-versa |
   | 4 | Grant camera, then deny camera | Denied → still joins audio-only with a clear state |
   | 5 | Third device declines | Never joins; call unaffected |
   | 6 | In-call chat mobile ↔ web | Messages with correct sender names both ways |
   | 7 | Mobile backgrounded / screen locked | Audio continues; reconnect UI correct |
   | 8 | Network drop on one device | "Reconnecting…", then recovers; no false leave |
   | 9 | Force-quit one device | Others unaffected; cron ends it at `expires_at` |
   | 10 | Hang up on mobile | Only that user leaves; call continues for others |
   | 11 | 30-min limit | Countdown → "N left" → auto-leave; cron cleans leftovers |
   | 12 | Speaker/earpiece routing | Sensible default; toggle works if added |

4. Acceptance: rows 1–12 pass on two Android devices; no stray tab; `expo-doctor`,
   `tsc`, `oxlint`, and the Android bundle all clean.

Effort: 2–4 days (mostly build queues + device passes).

## 9. Tests

- **Unit**: mobile `formatCallDuration` (colocated); any pure helpers from the
  tiles (e.g. grid sizing) if extracted. Mobile has no test suite today — add
  only where logic is non-trivial; the bulk of mobile call behaviour is exercised
  on device.
- **Manual**: the §8 matrix is the source of truth for mobile media.
- **Backend**: already covered by `tests/integration/cluster-calls.test.ts`; no
  new migrations in this plan.

## 10. Total effort estimate

| Phase | Time (1 dev) |
|---|---|
| 0 Router + hygiene | 0.5 day |
| 1 Pre-join + permissions | 2–3 days |
| 2 Call UI parity | 3–4 days |
| 3 In-call chat | 2–3 days |
| 4 Lifecycle UX | 2–4 days |
| 5 Timer/limit verification | 1 day |
| 6 Build + device matrix | 2–4 days |
| **Total** | **3–5 weeks** |

Biggest risks: Android locked-screen audio behaviour (§6.3), native build
friction and permission prompts on fresh installs (§1/§6), and the LiveKit RN
`useChat` topic needing to match the web built-in Chat for cross-platform chat
(§5 — verify early on two devices).

## 11. Out of scope (v1)

- **iOS support**: the app is Android-only; no iOS builds, background modes, or
  iOS device testing.
- OS push ringing for backgrounded users (needs the push pipeline + a new
  notification type; `CLUSTER_CALLS_PLAN.md` §2 defers this).
- Call recording, transcription, screen share (screen share is intentionally
  disabled by token grants on all platforms).
- A true per-month participant-minute budget (the 30-min wall-clock cap is the
  current guard; see `CLUSTER_CALLS_PLAN.md` §11 caveat).

# Sensorium Mobile (Expo, member-only)

The **Android** companion app for Sensorium, built with Expo / React Native and
`expo-router`. It ships the member experience - auth and onboarding, matching,
clusters, realtime chat, audio/video calls, posts, signals, votes, notifications,
profile/settings, reporting, and appeals. The **moderator and admin workspaces are
web-only** and have no mobile equivalent.

It shares the web app's Supabase backend and accounts 1:1: the same project, the
same schema/RLS/RPC functions, and the same private storage buckets. There is no
separate backend, and it is not served by Vercel - it is distributed through EAS
and the Android APK CI workflows.

- Design record (why it is built this way): [`../docs/archive/MOBILE_APP_PLAN.md`](../docs/archive/MOBILE_APP_PLAN.md)
- Deep backend reference: [`../docs/TECHNICAL.md`](../docs/TECHNICAL.md)

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Expo SDK 57, React Native 0.86, React 19 |
| Routing | `expo-router` (file-based, typed routes) |
| Server state | TanStack Query 5 + Supabase Realtime |
| Backend | Supabase (Postgres, Auth, Storage, Realtime) — shared with web |
| Auth | Supabase Auth: email/password and Google OAuth (via `expo-web-browser` + a deep-link callback) |
| Calls | LiveKit (`@livekit/react-native` + `@livekit/react-native-webrtc`); WebRTC globals registered in `src/lib/livekit.ts`; tokens minted by the `create-call-token` Edge Function |
| Push | `expo-notifications` → Expo Push → FCM on Android |
| GIFs | KLIPY (`EXPO_PUBLIC_KLIPY_*`) |
| Media & location | `expo-image-picker` / `expo-image-manipulator`, `expo-camera`, `expo-location` |
| Styling | React Native `StyleSheet` with tokens from `src/lib/theme-tokens.ts` (ported from [`../docs/DESIGN.md`](../docs/DESIGN.md)) |
| Builds | EAS (`eas.json`: `development`, `preview`, `production` APK profiles) and the Android APK CI workflow |

### Firebase / FCM

Firebase is **not** a direct dependency - there is no Firebase JS SDK in this app.
On Android, `expo-notifications` obtains an Expo push token that is delivered
through FCM, so Expo needs a Firebase project. `mobile/google-services.json` is
**gitignored and must never be committed**; it has to be present for any build with
push enabled. CI restores it from the base64 `GOOGLE_SERVICES_JSON` secret.

Delivery is server-side: the web repo's `send-push` Edge Function drains the
`push_outbox` and calls the Expo Push API. See [`../docs/TECHNICAL.md`](../docs/TECHNICAL.md).

## Project structure

```
mobile/
├─ app/                    # expo-router routes (file-based)
│  ├─ (auth)/              # login, signup, verify-email, forgot/reset password
│  ├─ (onboarding)/        # profile + matching-mode selection
│  ├─ (app)/               # member shell
│  │  ├─ home.tsx, posts.tsx, clusters.tsx, notifications.tsx, settings.tsx
│  │  └─ cluster/[clusterId]/   # room, members, signals, votes, settings, call
│  ├─ appeal.tsx           # restricted-account appeal
│  ├─ restricted.tsx       # suspended/banned landing
│  └─ auth/callback.tsx    # OAuth / recovery deep-link landing
├─ src/
│  ├─ components/          # shared + feature UI (room/, call/, posts, onboarding)
│  ├─ features/            # data hooks (TanStack Query) — mirrors web modules
│  ├─ lib/                 # supabase client, auth, push, livekit, theme, geo, utils
│  └─ legal/               # privacy policy / terms content
├─ assets/                 # icons, splash, notification icon
├─ scripts/                # sync-db-types, local android build helper
├─ app.json                # Expo config: permissions, plugins, deep-link scheme
└─ eas.json                # EAS build profiles
```

## Setup

Prerequisites: Node.js 20+ and npm. Expo Go is enough for most UI work, but
**calls and push notifications require a development build or a real device**.
Native Android builds also need the Android SDK/emulator (or `eas build`).

1. `cd mobile && cp .env.example .env` - use the staging `EXPO_PUBLIC_SUPABASE_URL` + publishable key first.
2. `npm install`
3. `npm run sync:db-types` - refresh `database.types.ts` and the generated helpers (see [Generated vs hand-written code](#generated-vs-hand-written-code)).
4. `npx expo start` - scan with Expo Go, or `npm run android` to run on a device/emulator.

For a build with push enabled, place a Firebase `google-services.json` at
`mobile/google-services.json` (gitignored) and see [`app.json`](app.json) for the
declared permissions and plugins.

## Environment variables

Set these in `mobile/.env` (see [`.env.example`](.env.example)). Only public values
belong here - the anon/publishable key is the only credential the app holds.

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (shared with web) |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable (anon) key |
| `EXPO_PUBLIC_KLIPY_APP_KEY` | no | KLIPY app key; enables the GIF picker |
| `EXPO_PUBLIC_KLIPY_ENDPOINT` | no | KLIPY API base URL (defaults to `https://api.klipy.com/api/v1`) |
| `EXPO_PUBLIC_GEOCODING_ENDPOINT` | no | Optional geocoding override used by local mode |

## Scripts

| Command | Purpose |
|---|---|
| `npm start` | start the Expo dev server |
| `npm run android` / `npm run ios` | build and run on a device/emulator (`expo run:*`) |
| `npm run lint` | run oxlint |
| `npm test` | run the mobile Vitest suite |
| `npm run sync:db-types` | regenerate synced db types + helpers from the web build |

There is also a local APK helper at [`scripts/android-build.ps1`](scripts/android-build.ps1)
for building an installable APK without EAS.

## Auth and deep links

- **Email/password** and **Google OAuth** through Supabase Auth.
- OAuth and password-recovery redirects come back to the app's `sensorium://`
  deep link and are completed in [`src/lib/deep-links.ts`](src/lib/deep-links.ts)
  (`handleAuthCallback`), landing on `app/auth/callback.tsx`.
- The URL scheme (`sensorium`) and app id (`online.thesensorium.app`) are declared
  in [`app.json`](app.json). The Google provider must allow the mobile redirect in
  the Supabase dashboard.

## Cluster calls

Calls are LiveKit rooms scoped to a cluster, started from the room.

- [`src/lib/livekit.ts`](src/lib/livekit.ts) registers the LiveKit/WebRTC globals
  once at startup (called from `src/app-providers.tsx`).
- Call state and mutations live in [`src/features/cluster-calls.ts`](src/features/cluster-calls.ts);
  the token comes from the `create-call-token` Edge Function.
- The screen is `app/(app)/cluster/[clusterId]/call.tsx`, with pre-join and
  permissions in `src/components/room/call/`.

## Push notifications

- `expo-notifications` obtains an **Expo push token** (FCM-backed on Android) and
  upserts it into the `push_tokens` table on sign-in; it is refreshed on foreground
  and removed on sign-out ([`src/lib/push.ts`](src/lib/push.ts)).
- Android channels: `messages`, `mentions`, `invites`, `governance`.
- Cold-start taps are routed via `getLaunchPushData()`; warm taps via a response
  listener, in [`src/lib/notification-routing.ts`](src/lib/notification-routing.ts).
- Push is a no-op in Expo Go and on web (guarded by `Constants.appOwnership`).
- Server delivery, preferences, and the outbox worker are documented in
  [`../docs/TECHNICAL.md`](../docs/TECHNICAL.md).

## Generated vs hand-written code

`npm run sync:db-types` does **more than types** - it copies and adapts a set of
files from the web `src/` so the two apps stay behavior-identical. **Do not
hand-edit generated files**; they are overwritten on the next sync (and CI checks
the input assumptions).

Generated from web:

- `src/lib/`: `database.types.ts`, `availability.ts`, `countries.ts`, `constants.ts`, `error.ts`, `utils.ts`, `query-retry.ts`, `modes.ts` (icon import adapted), `geo.ts` (geolocation adapted to `expo-location`)
- `src/features/`: `matching.ts`, `discovery.ts`, `introductions.ts`, `votes.ts`, `signals.ts`, `moderation.ts`, `mentions.ts`, `access.ts`, `appeals.ts`, `notifications.ts`, `gifs.ts`, `cluster.ts`, `posts.ts` (image-upload calls are rewritten to use React Native upload helpers)

Everything else is hand-written for mobile. Notable exceptions to keep an eye on:

- `src/features/realtime.ts` is **pinned** (the mobile copy uses a ref-counted
  `useClusterChannel` for tab-kept-mounted screens). If the web copy changes,
  reconcile it by hand.
- `src/features/cluster-calls.ts`, `src/features/avatars.ts`, and everything in
  `src/lib/` not listed above are mobile-only.

## Conventions

- Same as root [`AGENTS.md`](../AGENTS.md): strict TS, `@/` → `src/`, and only design tokens from `src/lib/theme-tokens.ts` (ported from [`../docs/DESIGN.md`](../docs/DESIGN.md)). No new colors, typefaces, or radii.
- Components never touch Supabase directly - reads/writes go through `src/features/` hooks wrapping TanStack Query, mirroring the web feature modules.
- Never edit `src/lib/database.types.ts` by hand - rerun `sync:db-types` after migrations.
- Member-only: do not port staff/admin surfaces into the app.

## Testing

`npm test` runs the small mobile Vitest suite (for example
[`src/components/room/format.test.ts`](src/components/room/format.test.ts)).
Behavior is primarily covered by the web unit suite and the repo's integration and
E2E suites, so keep the shared modules behavior-identical. Before pushing:

```bash
cd mobile
npm run lint
npx tsc --noEmit
npm test
```

## Building and release

- **EAS** ([`eas.json`](eas.json)): `development` (dev client), `preview` and
  `production` (internal APK). Requires the `EXPO_TOKEN` secret in CI.
- **Android APK CI workflow**: builds a release APK artifact on a Linux runner,
  reading `EXPO_PUBLIC_*` values per environment from repo variables and restoring
  `google-services.json` from the `GOOGLE_SERVICES_JSON` secret.
- The app points at the **staging** Supabase project for preview builds and the
  **production** project for release builds, matching the web environments.

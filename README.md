<p align="center">
  <img src="public/logo.png" alt="Sensorium logo" width="160" height="160" />
</p>

<h1 align="center">Sensorium</h1>

<p align="center">
  <strong>Eight strangers. One cluster.</strong><br />
  Small, permanent groups where real friendships actually grow.
</p>

<p align="center">
  <a href="#about">About</a> ·
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#scripts">Scripts</a> ·
  <a href="#testing">Testing</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-GPL--3.0-blue" alt="License: GPL-3.0" />
</p>

## About

Sensorium is an open-source social platform that places you into a permanent group of exactly **eight people**, called a **cluster**, matched by birth date or location. Once matched, the room unlocks after a 72-hour introduction phase, and you get tools built for long-term friendship: realtime chat with reactions and read receipts, a cluster-scoped posts feed, audio/video calls, availability check-ins, Signals (requests for help), and community governance through votes. It ships as a **web app** and an **Android app** that share one Supabase backend, plus moderator/admin workspaces and a transactional email + push pipeline.

## Platforms

- **Web app** (`src/`): the full product — chat, posts, discovery, moderation, and admin surfaces — served on Vercel.
- **Android app** (`mobile/`): an Expo/React Native companion for members, sharing the same Supabase backend and accounts, with push notifications via Expo. Admin and moderation stay web-only. See [`mobile/README.md`](mobile/README.md).

## Features

- **Matching**: enter up to five queues (exact birth date, birth month and day, birth year and month, birth year, or local radius). A cluster forms when a mode reaches eight ready people.
- **Cluster chat**: realtime messaging with edits, reply threads, @-mentions, emoji reactions, image sharing, a GIF picker (KLIPY), and presence (who is here, who is typing, who is online).
- **Read receipts**: per-message "seen by" detail with the time each member first read it, updated automatically as members scroll.
- **Cluster calls**: start or join audio/video calls from the room on web and Android, with ringing state and membership gating powered by LiveKit.
- **Introduction phase**: a five-question shared intro must be completed before the room opens, with a 72-hour deadline.
- **Posts**: a cluster-scoped feed of text, images, and GIFs — optional titles, heart likes, and threaded comments and replies, visible only to the cluster.
- **Clusters directory**: browse matching modes and preview a mode's active clusters (name, status, member count, formation date only).
- **Availability**: per-cluster availability status shown to members.
- **Signals**: raise a request for help, reply in threads, and track open and resolved states.
- **Governance**: votes for cluster renames and member replacement, invitation flows, and cooldowns.
- **Notifications & push**: a per-cluster notification center with per-type preferences, plus Android push notifications delivered through an Expo outbox pipeline.
- **Moderation, roles & appeals**: member reporting, a moderation queue with moderator/admin workspaces, warnings, temporary suspensions and permanent bans, and an in-app appeal flow with email notifications.
- **Safety**: per-user muting, a "My Reports" self-status view, and self-service account deletion that departs your clusters and anonymizes moderation records.

## Tech Stack

| Layer | Choice |
|---|---|
| Web frontend | React 19, TypeScript, Vite |
| Routing | React Router v8 |
| Styling | Tailwind CSS v4, tokens from `docs/DESIGN.md` |
| Server state | TanStack Query + Supabase Realtime |
| Mobile app | React Native via Expo (`mobile/`), expo-router, expo-notifications, EAS |
| Calls | LiveKit: `@livekit/components-react` (web), `@livekit/react-native` (mobile), tokens minted by the `create-call-token` Edge Function |
| GIFs | KLIPY, queried directly from the client with `VITE_KLIPY_APP_KEY` |
| Backend | Supabase (Postgres, Auth, Storage, Realtime) |
| Edge Functions | Supabase Edge Functions (Deno): `send-emails` (Resend), `send-push` (Expo), `create-call-token` (LiveKit) |
| Email | Resend, drained by the `send-emails` Edge Function |
| Push notifications | Expo Push, drained by the `send-push` Edge Function |
| Scheduled jobs | pg_cron over database functions |
| Testing and lint | oxlint, TypeScript, Vitest, Playwright |

See [`docs/TECHNICAL.md`](docs/TECHNICAL.md) for the full, versioned stack.

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (for the local Supabase stack)

### Run the app locally

```bash
# 1. Install dependencies
npm install

# 2. Start the local Supabase stack (Postgres, Auth, Storage, Realtime, Studio)
supabase start

# 3. Point the app at your local project
cp .env.example .env
#     VITE_SUPABASE_URL=http://127.0.0.1:54321
#     VITE_SUPABASE_ANON_KEY=<from `supabase status`>

# 4. Run the app in dev mode
npm run dev
```

Rebuild the backend from scratch against any fresh stack:

```bash
supabase db reset
```

Seed the demo golden-path user and cluster (used by local dev and E2E):

```bash
npm run seed:demo
```

> **Local realtime note:** if chat or presence does not flow after changing realtime migrations, run `supabase stop && supabase start` so the realtime server reconnects.

### Mobile app (Android)

The Android app lives in `mobile/` and shares the web app's Supabase backend and accounts.

```bash
cd mobile
cp .env.example .env          # EXPO_PUBLIC_SUPABASE_URL + anon key (staging first)
npm install
npm run sync:db-types         # refresh database.types.ts from the web build
npx expo start                # scan with Expo Go or run on a device
```

Android builds with push enabled require `mobile/google-services.json` and EAS credentials; see [`mobile/README.md`](mobile/README.md) for the full setup.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | Public anon (publishable) key |

Only the anon key is used in the browser. All privileged operations run through Postgres RPC functions guarded by Row Level Security. See [`docs/TECHNICAL.md`](docs/TECHNICAL.md#security) for how the environments, deployments, and CI secrets fit together.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build (`vite build`) |
| `npm run preview` | Locally preview the production build |
| `npm run lint` | Run oxlint |
| `npm test` | Run the Vitest and React Testing Library suite once |
| `npm run test:coverage` | Run the unit suite and enforce the v8 coverage gate |
| `npm run test:integration` | Run the integration suite against the local Supabase stack |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run the Playwright E2E suite (chromium + mobile-chromium projects) |
| `npm run check:release` | Dry-run the `develop` → `main` release merge before opening the release PR |
| `npm run seed:demo` | Idempotently seed the running local stack with demo data |
| `npm run sync:legal` | Refresh the legal content pages |

## Testing

Sensorium has three test layers. `npm test`, `npm run test:coverage`, `npm run test:integration`, and `npm run test:e2e` run them; see [`CONTRIBUTING.md`](CONTRIBUTING.md#testing) for the full matrix and what each layer requires.

- **Unit and component** (`npm test`): Vitest and React Testing Library run against pure logic (modes, availability, utils, onboarding validation) and components.
- **Coverage gate** (`npm run test:coverage`): the unit suite measures `src/**` with v8 and enforces minimum thresholds so CI fails if coverage regresses. The gate is an enforced floor, not a target.
- **Integration** (`npm run test:integration`): exercises the Supabase stack end-to-end (RPC functions, RLS, and `security definer` behavior) with fixtures created via service role and assertions through per-user anonymous clients. Requires a running local stack.
- **E2E** (`npm run test:e2e`): Playwright specs under `e2e/` walk the golden path, cluster room, posts, notifications, safety, seen-by, and settings. They run on two projects (desktop chromium and a mobile viewport) and expect a seeded local Supabase stack and the two demo accounts.
- **Mobile**: `mobile/` is linted with oxlint, typechecked with TypeScript, and has its own Vitest runner (currently a small suite covering shared helpers; most behavior is validated on web and in the integration suite).

Mobile scripts live in `mobile/package.json`: `npm start` / `npm run android` / `npm run ios` (Expo), `npm run lint`, `npm test`, and `npm run sync:db-types`.

## Environments

| Environment | Branch | Vercel deployment | Database |
|---|---|---|---|
| Production | `main` | Production | Production Supabase project |
| Preview | `develop` | Preview | Staging Supabase project |
| Feature preview | `feature/*` | Preview (per branch) | Staging Supabase project |

Sensorium uses a **staging-driven** Git workflow. All work starts from `develop`; `main` is reserved for production releases. Migrations are applied to staging when a PR merges into `develop`, and to production when `develop` merges into `main`. See [`docs/TECHNICAL.md`](docs/TECHNICAL.md#ci-and-deployment) and [`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

The Android app is built through the EAS/CI release workflows and shares the same production and staging Supabase projects as the web app.

## Security

- Every table has **Row Level Security enabled**. The frontend never writes tables directly except through RPC functions or RLS-permitted inserts.
- Chat media and profile photos are stored in **private buckets** and served through short-lived signed URLs.
- Push notifications route through a **database outbox** drained by the cron-woken `send-push` Edge Function (Expo); transactional emails route through `send-emails` (Resend). Both are guarded by secrets and are never reachable from the browser.
- No secrets ship in the client. Use `VITE_` variables for public values only.

If you find a vulnerability, please open a private issue or reach out before publishing details.

## Documentation

Read the docs in this order when you are new to the project. Each document states its audience up front; the index at [`docs/README.md`](docs/README.md) shows how they relate.

1. **Start here.** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) gives the high-level mental model: how the frontend, Supabase, and the database fit together. About 10-15 minutes.
2. **What the product is.** [`docs/PRD.md`](docs/PRD.md) describes the product requirements, screens, and user flows.
3. **What it looks like.** [`docs/DESIGN.md`](docs/DESIGN.md) documents the visual design system and design tokens.
4. **How it is built.** [`docs/TECHNICAL.md`](docs/TECHNICAL.md) is the deeper technical reference: stack, schema, migrations, storage, realtime, and deployment. Read it when you start working in the code.
5. **How to contribute.** [`CONTRIBUTING.md`](CONTRIBUTING.md) covers the Git workflow, code conventions, and testing requirements.

For the mobile app specifically, see [`mobile/README.md`](mobile/README.md).

Design records for features that already shipped (implementation plans) live in [`docs/archive/`](docs/archive/README.md). You do not need them to get started; reach for one only when you want the *why* behind a specific feature.

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before starting. It covers the development workflow, code style, database and migration rules, and testing requirements.

By participating in this project you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Released under the [GNU General Public License, Version 3](https://www.gnu.org/licenses/gpl-3.0.en.html) (GPL-3.0).

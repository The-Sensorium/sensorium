# Technical Architecture

Sensorium is a React single-page application backed by Supabase (Postgres, Auth, Storage, Realtime). This document describes the stack, how the pieces fit together, and the key design decisions.

## Tech Stack

### Frontend

| Layer | Choice |
|---|---|
| Framework | React 19 |
| Router | react-router 8 |
| Data fetching | TanStack Query 5 |
| Styling | Tailwind CSS 4 via the Vite plugin |
| Icons | lucide-react |
| Fonts | Plus Jakarta Sans, Special Elite (via @fontsource) |
| Build tool | Vite 8, TypeScript ~6.0 (project references) |
| Linting | oxlint |
| Unit tests | Vitest 4 + Testing Library, jsdom |
| E2E tests | Playwright |

### Backend

| Layer | Choice |
|---|---|
| Database | Supabase Postgres |
| Auth | Supabase Auth (email/password) |
| Storage | Supabase Storage (private buckets) |
| Realtime | Supabase Realtime |
| Scheduled jobs | pg_cron over database functions |
| CLI | Supabase CLI (local stack via Docker) |

## Repository Layout

```
sensorium/
├─ docs/                  # product requirements and design tokens
├─ supabase/
│  ├─ config.toml         # local Supabase stack configuration
│  └─ migrations/         # order-dependent SQL, 0001 to 0032
├─ src/
│  ├─ app/                # router, providers, guards, auth context, layouts
│  ├─ pages/              # route page components
│  ├─ components/         # shared and feature components
│  ├─ features/           # domain hooks, TanStack Query sources, realtime subscriptions
│  ├─ lib/                # supabase client, typed database, modes, moods, theme, utils
│  └─ test/               # unit test helpers
├─ e2e/                   # Playwright E2E specs (golden path, cluster room, settings, notifications)
├─ tests/integration/     # Vitest integration suite against the local Supabase stack
├─ scripts/               # idempotent demo seed
├─ public/                # favicons and static assets
├─ vercel.json            # SPA rewrites for Vercel
└─ package.json
```

## Feature Areas

The app is organized into feature modules in `src/features/`:

| Module | Responsibility |
|---|---|
| `matching.ts` | queue entry, matching status |
| `introductions.ts` | the five-question shared intro and 72-hour phase |
| `cluster.ts` | cluster data, realtime chat, chat-image signed URLs |
| `realtime.ts` | shared realtime subscription plumbing |
| `signals.ts` | request-for-help threads |
| `votes.ts` | governance votes and cooldowns |
| `notifications.ts` | user notifications |
| `moderation.ts` | reporting |
| `avatars.ts` | avatar signed URLs and storage paths |

## Database

All schema lives in `supabase/migrations/` and is order-dependent. Migrations build on each other:

- **Core schema (0001-0010)**: enums, profiles, queues and clusters, chat, signals, moods and status, votes and member replacement, notifications, reports, and demo seed data.
- **Functions (0011-0015)**: matching, intro and social helpers, vote and replacement functions, and the pg_cron schedule.
- **Storage and permissions (0016-0020)**: storage buckets, grants, and fixes.
- **Realtime (0021-0024)**: chat, signal replies, governance events, and notification payloads.
- **Hardening (0025-0032)**: RLS and privilege tightening, account deletion, and private storage buckets.

Every table has Row Level Security enabled. The frontend never writes tables directly except through Postgres RPC functions or RLS-permitted inserts.

### Scheduled jobs

Database functions run on a pg_cron schedule, for example to expire stale signals or rebalance membership. The schedule is defined in a migration and is idempotent.

## Storage

Media is stored in private buckets and served through short-lived signed URLs, never through the public object URL.

| Bucket | Access rule |
|---|---|
| `chat-images` | readable only by active members of the owning cluster (`is_active_member(cluster_id)`) |
| `avatars` | readable by any authenticated user |

The browser obtains a signed URL with a short TTL, uses it to render the image, and requests a fresh URL before expiry. Uploads store the bare storage path so URLs are never persisted. See `src/features/avatars.ts` and `src/features/cluster.ts`.

## Auth

Authentication uses Supabase Auth with email and password. Account deletion leaves the clusters clean: the deleting user departs each cluster before the profile is removed (migration 0028).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | public anon (publishable) key |

Only the anon key is used in the browser. All privileged operations run through Postgres RPC functions guarded by Row Level Security. No secrets ship in the client.

## Local Development

The Supabase CLI starts the full stack in Docker (Postgres, API, Studio, Inbucket, Storage, Realtime) using `supabase/config.toml`. `npm run seed:demo` seeds demo users and a cluster. Run migrations from scratch with `supabase db reset`.

## CI and Deployment

Two GitHub Actions workflows run on push and pull requests to `main`:

- **`ci.yml`**: lint, unit tests with the v8 coverage gate, build, local migration apply plus the integration suite, and the blocking Playwright e2e suite.
- **`db-migrate.yml`**: applies pending migrations to the linked Supabase project.

The frontend is served on Vercel with SPA rewrites defined in `vercel.json`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | start the Vite dev server |
| `npm run build` | typecheck then build for production |
| `npm run lint` | run oxlint |
| `npm test` | run the Vitest suite |
| `npm run test:coverage` | run the unit suite and enforce the v8 coverage gate |
| `npm run test:integration` | run the integration suite against the local Supabase stack |
| `npm run test:watch` | run Vitest in watch mode |
| `npm run test:e2e` | run the Playwright suite |
| `npm run seed:demo` | seed the local database with demo data |
| `npm run preview` | preview the production build |

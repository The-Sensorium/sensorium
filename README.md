<p align="center">
  <img src="public/logo.png" alt="Sensorium logo" width="160" height="160" />
</p>

<h1 align="center">Sensorium</h1>

<p align="center">
  <strong>Eight strangers. One cluster.</strong><br />
  Small, permanent groups where real friendships actually grow.
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="#license">License</a>
</p>

---

## About

Sensorium is an open-source social platform that places you into a permanent group of exactly **eight people**, called a **cluster**, matched by birth date or location. Once you are matched, the room unlocks after a 72-hour introduction phase, and you get tools built for long-term friendship: realtime chat, mood and pulse check-ins, Signals (requests for help), and community governance through votes.

## Features

- **Matching**: enter up to six queues (exact birth date, birth month and day, birth year and month, birth year, or local radius). A cluster forms when a mode reaches eight ready people.
- **Cluster chat**: realtime messaging, reactions, edits, image sharing, and presence. Who is here, who is typing, who is online.
- **Introduction phase**: a five-question shared intro must be completed before the room opens, with a 72-hour deadline.
- **Moods and pulse**: per-cluster mood, status, and availability, aggregated into a live pulse.
- **Signals**: raise a request for help, reply in threads, and track open and resolved states.
- **Governance**: votes for cluster renames and member replacement, invitation flows, and cooldowns.
- **Notifications**: a per-cluster notification center with per-type preferences.
- **Safety**: member reporting, moderation checks, and self-service account deletion.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Routing | React Router v8 (library mode) |
| Styling | Tailwind CSS v4, design tokens from `DESIGN.md` |
| Icons | lucide-react |
| Server state | TanStack Query + Supabase Realtime |
| Backend | Supabase (Postgres, Auth, Storage, Realtime) |
| Scheduled jobs | pg_cron over database functions |
| Testing and lint | oxlint, TypeScript, Vitest, Playwright |

## Repository Layout

```
sensorium/
├─ docs/
│  ├─ PRD.md              # product requirements
│  ├─ DESIGN.md           # visual design system and tokens
│  └─ TECHNICAL.md        # tech stack and architecture
├─ supabase/
│  └─ migrations/        # order-dependent SQL: schema, RLS, functions, cron
├─ src/
│  ├─ app/               # router, providers, guards, auth context, layouts
│  ├─ pages/             # route page components
│  ├─ components/        # shared and feature components
│  ├─ features/          # domain hooks, TanStack Query sources, realtime subscriptions
│  └─ lib/               # supabase client, typed database, modes, moods, theme, utils
├─ e2e/                  # Playwright E2E specs (golden path, cluster room, settings, notifications)
├─ tests/integration/   # Vitest integration suite against the local Supabase stack
├─ scripts/              # idempotent demo seed
├─ public/               # favicons and static assets
├─ .env.example
└─ package.json
```

## Prerequisites

- Node.js 20+ and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (for the local Supabase stack)

## Getting Started

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

Rebuild the backend from scratch against any fresh stack with:

```bash
supabase db reset
```

Seed the demo golden-path user and cluster (used by local dev and E2E):

```bash
npm run seed:demo
```

> **Local realtime note:** if chat or presence does not flow after changing realtime migrations, run `supabase stop && supabase start` so the realtime server reconnects.

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
| `npm run test:e2e` | Run the Playwright E2E suite |
| `npm run seed:demo` | Idempotently seed the running local stack with demo data |

## Testing

- **Unit and component** (`npm test`): Vitest and React Testing Library run against pure logic (modes, moods, utils, onboarding validation) and components. See `vite.config.ts` for the jsdom configuration.
- **Coverage gate** (`npm run test:coverage`): the unit suite measures `src/**` with v8 and enforces minimum thresholds so CI fails if coverage regresses. The gate is an enforced floor, not a target; see the coverage thresholds in `vite.config.ts`.
- **Integration** (`npm run test:integration`): exercises the Supabase stack end-to-end — RPC functions, RLS, and `security definer` behavior — with fixtures created via service role and assertions through per-user anonymous clients. Requires a running local stack (`supabase start`) and reads its anon key/service role from `npx supabase status -o json`. See `vitest.integration.config.ts` (tests in `tests/integration/` run sequentially against the shared local database).
- **E2E** (`npm run test:e2e`): Playwright specs under `e2e/` walk the golden path, cluster room, settings, and notifications flows. They expect a seeded local Supabase stack and the demo account (override with `E2E_EMAIL` and `E2E_PASSWORD`). Install the browser once with `npx playwright install chromium`.

Tests live under `src/**/*.test.ts(x)`, `tests/integration/**/*.test.ts`, and `e2e/**/*.spec.ts` and are excluded from the production build.

## CI/CD

`.github/workflows/ci.yml` runs on push and pull requests to `main`:

- **lint, test, build**: `npm ci`, oxlint, Vitest, Vite build. The build artifact is uploaded.
- **migrations**: starts a local Supabase stack, applies all migrations, runs the integration suite, and confirms a clean, lint-free database build.
- **e2e (blocking)**: starts Supabase, seeds demo data, installs Chromium, and runs the Playwright suite.

`.github/workflows/db-migrate.yml` applies pending migrations to the linked Supabase project on every push to `main`.

Deployment: the frontend is served on Vercel, with SPA rewrites defined in `vercel.json`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | Public anon (publishable) key |

Only the anon key is used in the browser. All privileged operations run through Postgres RPC functions guarded by Row Level Security.

## Security

- Every table has **Row Level Security enabled**. The frontend never writes tables directly except through RPC functions or RLS-permitted inserts.
- Chat media and profile photos are stored in **private buckets** and served through short-lived signed URLs.
  - `chat-images` is readable only by active members of the owning cluster.
  - `avatars` is readable by any authenticated user.
- No secrets ship in the client. Use `VITE_` variables for public values only.

If you find a vulnerability, please open a private issue or reach out before publishing details.

## Documentation

Product and design docs are kept in this repository and treated as the single source of truth:

- [`docs/PRD.md`](docs/PRD.md): product requirements.
- [`docs/DESIGN.md`](docs/DESIGN.md): visual design system and tokens.
- [`docs/TECHNICAL.md`](docs/TECHNICAL.md): tech stack and architecture.

## Contributing

Contributions are welcome. This is a small, carefully scoped project, so please:

1. Read the PRD and design docs in the `docs/` folder before starting.
2. Open an issue to discuss the change first, especially for anything that touches the schema, RLS, or realtime contracts.
3. Follow the design tokens in `docs/DESIGN.md`; do not introduce new palettes, typefaces, or radii outside those tokens.
4. Keep migrations order-dependent and verify with `supabase db reset` before opening a pull request.

## License

Released under the [GNU General Public License, Version 3](https://www.gnu.org/licenses/gpl-3.0.en.html) (GPL-3.0).

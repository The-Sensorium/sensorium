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

<div align="center">
  <table>
    <tr>
      <th>Environment</th>
      <th>URL</th>
    </tr>
    <tr>
      <td><b>Production</b></td>
      <td><a href="https://www.thesensorium.online">www.thesensorium.online</a></td>
    </tr>
    <tr>
      <td><b>Preview</b></td>
      <td><a href="https://preview.thesensorium.online">preview.thesensorium.online</a></td>
    </tr>
  </table>
</div>

---

## About

Sensorium is an open-source social platform that places you into a permanent group of exactly **eight people**, called a **cluster**, matched by birth date or location. Once you are matched, the room unlocks after a 72-hour introduction phase, and you get tools built for long-term friendship: realtime chat, mood and pulse check-ins, Signals (requests for help), and community governance through votes.

## Features

- **Matching**: enter up to five queues (exact birth date, birth month and day, birth year and month, birth year, or local radius). A cluster forms when a mode reaches eight ready people.
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
| Routing | React Router v8 |
| Styling | Tailwind CSS v4, tokens from `docs/DESIGN.md` |
| Server state | TanStack Query + Supabase Realtime |
| Backend | Supabase (Postgres, Auth, Storage, Realtime) |
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
| `npm run test:e2e` | Run the Playwright E2E suite |
| `npm run seed:demo` | Idempotently seed the running local stack with demo data |

## Testing

Sensorium has three test layers. `npm test`, `npm run test:coverage`, `npm run test:integration`, and `npm run test:e2e` run them; see [`CONTRIBUTING.md`](CONTRIBUTING.md#testing) for the full matrix and what each layer requires.

- **Unit and component** (`npm test`): Vitest and React Testing Library run against pure logic (modes, moods, utils, onboarding validation) and components.
- **Coverage gate** (`npm run test:coverage`): the unit suite measures `src/**` with v8 and enforces minimum thresholds so CI fails if coverage regresses. The gate is an enforced floor, not a target.
- **Integration** (`npm run test:integration`): exercises the Supabase stack end-to-end (RPC functions, RLS, and `security definer` behavior) with fixtures created via service role and assertions through per-user anonymous clients. Requires a running local stack.
- **E2E** (`npm run test:e2e`): Playwright specs under `e2e/` walk the golden path, cluster room, settings, and notifications flows. They expect a seeded local Supabase stack and the demo account.

## Environments

| Environment | Branch | Vercel deployment | Database |
|---|---|---|---|
| Production | `main` | Production | Production Supabase project |
| Preview | `develop` | Preview | Staging Supabase project |
| Feature preview | `feature/*` | Preview (per branch) | Staging Supabase project |

Sensorium uses a **staging-driven** Git workflow. All work starts from `develop`; `main` is reserved for production releases. Migrations are applied to staging when a PR merges into `develop`, and to production when `develop` merges into `main`. See [`docs/TECHNICAL.md`](docs/TECHNICAL.md#ci-and-deployment) and [`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

## Security

- Every table has **Row Level Security enabled**. The frontend never writes tables directly except through RPC functions or RLS-permitted inserts.
- Chat media and profile photos are stored in **private buckets** and served through short-lived signed URLs.
- No secrets ship in the client. Use `VITE_` variables for public values only.

If you find a vulnerability, please open a private issue or reach out before publishing details.

## Documentation

Read the docs in this order when you are new to the project. Each document states its audience up front; the index at [`docs/README.md`](docs/README.md) shows how they relate.

1. **Start here.** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) gives the high-level mental model: how the frontend, Supabase, and the database fit together. About 10-15 minutes.
2. **What the product is.** [`docs/PRD.md`](docs/PRD.md) describes the product requirements, screens, and user flows.
3. **What it looks like.** [`docs/DESIGN.md`](docs/DESIGN.md) documents the visual design system and design tokens.
4. **How it is built.** [`docs/TECHNICAL.md`](docs/TECHNICAL.md) is the deeper technical reference: stack, schema, migrations, storage, realtime, and deployment. Read it when you start working in the code.
5. **How to contribute.** [`CONTRIBUTING.md`](CONTRIBUTING.md) covers the Git workflow, code conventions, and testing requirements.

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before starting. It covers the development workflow, code style, database and migration rules, and testing requirements.

By participating in this project you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Released under the [GNU General Public License, Version 3](https://www.gnu.org/licenses/gpl-3.0.en.html) (GPL-3.0).

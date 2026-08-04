# Contributing to Sensorium

Thanks for wanting to contribute. Sensorium is a small, carefully scoped project, so before you write code, please read this guide and the docs. It will save both you and the maintainers time.

## Table of Contents

- [Before you start](#before-you-start)
- [Project overview](#project-overview)
- [Setting up a development environment](#setting-up-a-development-environment)
- [Finding something to work on](#finding-something-to-work-on)
- [Development workflow](#development-workflow)
- [Code style and conventions](#code-style-and-conventions)
- [Database and migrations](#database-and-migrations)
- [Testing](#testing)
- [Pull requests](#pull-requests)
- [Code of Conduct](#code-of-conduct)

## Before you start

Please read these before opening an issue or a pull request:

1. [`docs/PRD.md`](docs/PRD.md) — the product requirements. Understand what the product is before changing how it behaves.
2. [`docs/DESIGN.md`](docs/DESIGN.md) — the visual design system. Do not introduce new palettes, typefaces, or radii outside the documented tokens.
3. [`docs/TECHNICAL.md`](docs/TECHNICAL.md) — the architecture, schema, and how migrations, RLS, realtime, and storage fit together.

## Project overview

Sensorium places each user into a permanent cluster of exactly eight people, matched by birth date or location. Clusters get realtime chat, an introduction phase, mood and pulse check-ins, Signals (requests for help), and community governance through votes. The frontend is a React 19 SPA (Vite + TypeScript + Tailwind v4) backed by Supabase (Postgres, Auth, Storage, Realtime). See the [README](README.md) for the full feature list and quick start.

## Setting up a development environment

You need Node.js 20+, npm, the [Supabase CLI](https://supabase.com/docs/guides/cli), and Docker.

```bash
# 1. Install dependencies
npm install

# 2. Start the local Supabase stack (Postgres, Auth, Storage, Realtime, Studio)
supabase start

# 3. Point the app at the local stack
cp .env.example .env
#     VITE_SUPABASE_URL=http://127.0.0.1:54321
#     VITE_SUPABASE_ANON_KEY=<from `supabase status`>

# 4. Run the app
npm run dev
```

If the database changes under you, rebuild it from scratch and reseed:

```bash
supabase db reset
npm run seed:demo
```

> **Realtime note:** if chat or presence does not flow after changing realtime migrations, run `supabase stop && supabase start` so the realtime server reconnects.

## Finding something to work on

- Check the [issues](https://github.com/The-Sensorium/sensorium/issues) tab for `good first issue` and `help wanted` labels.
- If you have a feature in mind that isn't already an issue, [open an issue](#opening-an-issue) to discuss it first.

## Development workflow

1. **Open an issue first.** Discuss the change before opening a pull request, especially anything that touches the schema, RLS, or realtime contracts. This is a small project; the maintainers want to keep the surface area intentional.
2. **Create a branch.** Use a short, descriptive branch name, e.g. `feat/signal-reactions`, `fix/avatar-upload`, `docs/contributing`.
3. **Make your changes.** Keep them focused on the issue. Try to keep the diff reviewable.
4. **Add tests.** Changes to logic should come with unit tests; changes that cross the database boundary should come with integration tests where feasible.
5. **Run the checks below locally** before pushing.

### Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add signal reactions
fix: correct avatar upload rotation
docs: update migration numbering
test: cover vote cooldown edge case
chore: bump dependencies
```

A scope is welcome for larger areas, e.g. `feat(cluster): ...`. Keep each commit focused on a single logical change.

### Pre-push checks

```bash
npm run lint
npm run test:coverage
npm run build
```

If you changed migrations, also run:

```bash
supabase db reset          # confirm a clean, lint-free database build
npm run test:integration   # integration suite against the fresh stack
```

E2E changes are validated in CI; you can run them locally with `npm run test:e2e` after `supabase start` and `npm run seed:demo`.

## Code style and conventions

- **Linting:** oxlint via `npm run lint`. There are no fix-up scripts; keep the linter clean by hand.
- **Type safety:** strict TypeScript. `npm run build` runs `tsc -b`, so type errors fail the build.
- **No comments unless they carry meaning.** Prefer expressive code over explanatory comments.
- **Styling:** Tailwind utility classes, restricted to the tokens in `docs/DESIGN.md`. No new colors, typefaces, or radii.
- **Imports:** use the `@/` alias for `src/` paths, e.g. `import { modes } from '@/lib/modes'`.
- **React:** follow the patterns already in the codebase — TanStack Query for server state, feature modules in `src/features/`, colocated tests next to the code they cover.

## Database and migrations

Migrations live in `supabase/migrations/` and are **order-dependent**. This is important:

- Name files by sequence, e.g. `0035_short_description.sql`. Never edit an applied migration — add a new one.
- Apply new migrations locally with `supabase db reset` and verify they build cleanly with `supabase db lint --local`.
- Every table must have **Row Level Security enabled**. The frontend should never write tables directly except through RPC functions or RLS-permitted inserts.
- Keep privileged operations in `security definer` functions and restrict them with grants, not by trusting the caller.
- Verify your migration against the integration suite in `tests/integration/`, which exercises RLS and RPC behavior with per-user clients.

## Testing

The project has three layers:

| Layer | Command | Requires |
|---|---|---|
| Unit and component | `npm test` / `npm run test:coverage` | Nothing |
| Integration | `npm run test:integration` | `supabase start` |
| E2E | `npm run test:e2e` | `supabase start` + `npm run seed:demo` + `npx playwright install chromium` |

The coverage gate in `vite.config.ts` is an enforced floor — CI fails if it regresses. Treat it as a minimum, not a target.

## Pull requests

1. Push your branch and open a PR against `main`. Use the pull request template and fill it out.
2. The CI workflows run on every PR: lint, coverage, build, migration apply, integration suite, and the blocking E2E suite. All must pass.
3. Request review from a maintainer. Respond to feedback; it's part of the process.
4. Once approved and green, a maintainer merges. Keep `main` green — it is deployed.

## Code of Conduct

By participating in this project you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

# AGENTS.md

Sensorium: React 19 SPA (Vite + TypeScript + Tailwind v4 + TanStack Query) with a fully Supabase backend (Postgres, Auth, Storage, Realtime, pg_cron). There is no separate backend service — security lives in the database (RLS + RPC functions).

## Commands

- `npm run build` — typecheck (`tsc -b`) then `vite build`. There is no separate typecheck script; type errors fail the build.
- `npm run lint` — oxlint. No autofix script; keep it clean by hand.
- `npm test` — unit/component Vitest (jsdom), matches `src/**/*.{test,spec}.{ts,tsx}`. Run one file with `npm test <path>`.
- `npm run test:coverage` — unit suite + a **hard v8 coverage gate** in `vite.config.ts` (lines 34%, functions 33%, branches 20%). CI fails on regression; never lower the thresholds.
- `npm run test:integration` — uses `vitest.integration.config.ts` (Node env, sequential, 20s timeouts). Matches `tests/integration/**/*.test.ts` only. **Requires `supabase start`.** Runs RLS/RPC/`security definer` behavior against the live stack.
- `npm run test:e2e` — Playwright under `e2e/`. Requires `supabase start` + `npm run seed:demo` + `npx playwright install chromium`. The config starts the Vite dev server itself; tests select by the `data-e2e` attribute.
- `npm run seed:demo` — idempotent; writes `.env` automatically (URL + anon key from `supabase status`) and creates the demo account `diya@demo.example` / `sensor123` in cluster "Aurora".

Env is just `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (both public). The browser holds only the anon key.

## Local stack

- `supabase start` for the full Docker stack; `supabase db reset` rebuilds it from scratch; then rerun `npm run seed:demo`.
- After changing **realtime** migrations, run `supabase stop && supabase start` or realtime won't pick up the change.
- `supabase db lint --local` validates migrations.

## Migrations (strict rules)

- Lives in `supabase/migrations/`, **order-dependent**, numbered `NNNN_description.sql`. **Never edit an applied migration — add a new one.**
- Remote DBs are only migrated on merge (staging when a PR lands on `develop`, production when `develop` merges to `main`). Feature branches never apply migrations directly.
- Every table must have RLS enabled; frontend writes only via RPC functions or RLS-permitted inserts; privileged ops live in `security definer` functions guarded by grants.
- Storage is private buckets + short-lived signed URLs; persist bare storage paths, never the URL.
- `src/lib/database.types.ts` is generated from the schema and must be kept in sync after migration changes (no codegen script in `package.json`).

## Git workflow

- Staging-driven: branch from `develop` (`feat/...`, `fix/...`, `docs/...`), target `develop` in PRs. **Never branch from or PR into `main`**; main is release-only via a `develop` → `main` PR.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Pre-push: `npm run lint`, `npm run test:coverage`, `npm run build`. If migrations changed, also `supabase db reset` + `npm run test:integration`.

## Conventions

- All server reads go through feature modules in `src/features/` (`cluster.ts`, `signals.ts`, etc.) that wrap TanStack Query. Components never talk to Supabase directly.
- `@/` aliases `src/`. Strict TypeScript. No comments unless they carry meaning.
- Tailwind utilities restricted to tokens in `docs/DESIGN.md` — no new colors, typefaces, or radii.
- Tests are colocated with source (`foo.ts` + `foo.test.ts(x)`).

## Docs are source of truth

`docs/` is canonical and kept current; README and CONTRIBUTING point to it. Read order: `docs/ARCHITECTURE.md` → `docs/PRD.md` → `docs/DESIGN.md` → `docs/TECHNICAL.md`. CI skips markdown/docs-only changes (`paths-ignore` in `.github/workflows/ci.yml`).

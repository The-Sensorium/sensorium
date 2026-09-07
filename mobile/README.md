# Sensorium Mobile (Expo, member-only)

Member-only React Native app sharing the web app's Supabase backend. Admin/moderation stay web-only. Full plan: `docs/MOBILE_APP_PLAN.md`.

## Setup

1. `cd mobile && cp .env.example .env` — use staging `EXPO_PUBLIC_SUPABASE_URL` + anon key first.
2. `npm install`
3. `npm run sync:db-types` — copies `database.types.ts` + pure helpers from web `src/lib`.
4. `npx expo start` — scan with Expo Go.

## Conventions

- Same as root `AGENTS.md`: strict TS, `@/` → `src/`, Tailwind tokens only (see `src/lib/theme-tokens.ts`, ported from `docs/DESIGN.md`).
- Components never touch Supabase directly — reads/writes go through `src/features/` hooks wrapping TanStack Query.
- Never edit `src/lib/database.types.ts` by hand — rerun sync after migrations.

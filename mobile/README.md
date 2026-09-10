# Sensorium Mobile (Expo, member-only)

The Android companion app for Sensorium, built with Expo/React Native and
`expo-router`. It ships the **member** experience - auth, onboarding, matching,
clusters, chat, calls, posts, signals, votes, notifications, profile/settings,
reporting, and appeals. The moderator and admin workspaces stay web-only.

It shares the web app's Supabase backend and accounts 1:1: the same project, the
same schema/RLS/RPC functions, and the same private storage buckets. It is not a
separate backend, and it is not served by Vercel - it is distributed through EAS
and the Android APK CI workflows.

Design record: [`../docs/archive/MOBILE_APP_PLAN.md`](../docs/archive/MOBILE_APP_PLAN.md).

## Setup

1. `cd mobile && cp .env.example .env` - use the staging `EXPO_PUBLIC_SUPABASE_URL` + publishable key first.
2. `npm install`
3. `npm run sync:db-types` - copies `database.types.ts` + pure helpers from web `src/lib`.
4. `npx expo start` - scan with Expo Go, or `npm run android` to run on a device/emulator.

Android builds with push enabled require `mobile/google-services.json` and EAS
credentials; see the repo [`README`](../README.md#mobile-app-android) and
[`app.json`](app.json).

## Scripts

| Command | Purpose |
|---|---|
| `npm start` | start the Expo dev server |
| `npm run android` / `npm run ios` | run on a device/emulator |
| `npm run lint` | run oxlint |
| `npm test` | run the mobile Vitest suite |
| `npm run sync:db-types` | refresh `database.types.ts` and shared helpers from the web build |

## Conventions

- Same as root [`AGENTS.md`](../AGENTS.md): strict TS, `@/` → `src/`, and only design tokens from `src/lib/theme-tokens.ts` (ported from [`docs/DESIGN.md`](../docs/DESIGN.md)). No new colors, typefaces, or radii.
- Components never touch Supabase directly - reads/writes go through `src/features/` hooks wrapping TanStack Query, mirroring the web feature modules.
- Never edit `src/lib/database.types.ts` by hand - rerun `sync:db-types` after migrations.
- Some feature modules are manual twins of the web ones (`src/features/cluster.ts`, `posts.ts`, etc.); when you change shared behavior, update both so they stay behavior-identical.

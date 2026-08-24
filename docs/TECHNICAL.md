# Technical Architecture

This is the deep technical reference for Sensorium. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first for the high-level mental model; this document fills in the details: exact libraries, the database schema, migrations, storage, realtime, environment variables, and how the project is built and deployed.

For a quick start and the front-door overview, see the [README](../README.md).

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
├─ docs/                  # product, design, and architecture documentation
├─ supabase/
│  ├─ config.toml         # local Supabase stack configuration
│  ├─ migrations/         # order-dependent SQL: schema, RLS, functions, cron
│  └─ functions/          # Edge Functions (send-emails + shared templates)
├─ src/
│  ├─ app/                # router, providers, guards, auth context, layouts
│  ├─ pages/              # route page components
│  ├─ components/         # shared and feature components
│  ├─ features/           # domain hooks, TanStack Query sources, realtime subscriptions
│  ├─ lib/                # supabase client, typed database, modes, availability, theme, utils
│  └─ test/               # unit test helpers
├─ e2e/                   # Playwright E2E specs (golden path, cluster room, settings, notifications)
├─ tests/integration/     # Vitest integration suite against the local Supabase stack
├─ scripts/               # idempotent demo seed
├─ public/                # favicons and static assets
├─ vercel.json            # SPA rewrites for Vercel
├─ .env.example           # local environment variables
└─ package.json
```

## Feature Areas

The app is organized into feature modules in `src/features/`. Each module owns one domain and exposes its data hooks, TanStack Query sources, mutations, and realtime subscriptions.

| Module | Responsibility |
|---|---|
| `matching.ts` | queue entry, matching status |
| `introductions.ts` | the five-question shared intro and 72-hour phase |
| `cluster.ts` | cluster data, realtime chat, chat-image signed URLs |
| `realtime.ts` | shared realtime subscription plumbing |
| `signals.ts` | request-for-help threads |
| `votes.ts` | governance votes and cooldowns |
| `notifications.ts` | user notifications |
| `moderation.ts` | reporting, moderation queue and case actions, account restriction status |
| `avatars.ts` | avatar signed URLs and storage paths |
| `mentions.ts` | mention parsing and linkification |
| `appeals.ts` | in-app appeals (restricted users) and the admin appeal queue |
| `posts.ts` | standalone cluster-scoped posts feed (`/posts`), optional post title, heart likes (post + comment/reply), threaded replies, post/comment-image signed URLs, comment/reply + like notifications |

### Email pipeline

Email is outbound-only and queued in the DB. `outbound_emails` rows are written by enforcement/appeal RPC functions in the same transaction as the action; a pg_cron job (`pump_outbound_emails`) POSTs batches to the `send-emails` Edge Function (guarded by a shared secret against `SENSORIUM_EMAIL_SECRET`), which claims rows, renders a template, forwards to Resend, and marks each row sent/failed. `recover_stuck_sending` re-queues rows stuck in `sending`. The `anon`/`authenticated` roles hold no grants on `outbound_emails` or `email_settings`; only `service_role` (and postgres for cron) touch them. See `docs/EMAIL_NOTIFICATIONS_APPEALS_PLAN.md` for the full design.

### Posts

Posts are a cluster-scoped surface reached from the top nav (`/posts`) and
deep-linked per item (`/posts/:postId`), laid out Reddit/Twitter-style. A post
belongs to exactly one cluster and is visible only to its active members
(`is_active_member` + `cluster_unlocked`); the feed shows one selected cluster at
a time.

- **Schema (0072–0082)**: `posts` (`title` optional, `content`, `image_url`,
  `gif_url`, `moderation_status`), `post_comments` (flat thread with a
  `parent_comment_id` reply target), `post_likes`, and `comment_likes`. Post and
  comment media live in a private `posts-images` bucket; GIFs are remote KLIPY
  URLs.
- **Replies (Instagram-style)**: replies render indented under their parent
  comment as a single thread; a reply that targets another reply is prefixed with
  `@name`. Any comment can be replied to, but replies stay one visual level.
- **Likes**: a single heart per user per post and per comment/reply
  (`toggle_post_like`, `toggle_comment_like`), applied optimistically in the UI.
  Likes are counted client-side from the likes query; `comment_likes` is the only
  new realtime table (0074 publication is extended by 0082).
- **Moderation**: posts/comments carry `moderation_status`; members report them
  via `report_post` / `report_post_comment`, and moderators hide/restore them
  (`hide_post`, `restore_post`, `hide_post_comment`, `restore_post_comment`),
  writing to `moderation_actions` and emitting a `moderation_notice`.
- **Notifications**: `create_post_comment` notifies the post author ("replied to
  your post") and, on a reply, the parent-comment author ("replied to your
  comment"); `toggle_post_like` notifies the post author. They are gated at
  read-time by `notification_allowed` via the `post_comment` / `post_like`
  preference columns (0080).

### Chat read receipts

Room members each carry a read watermark, `cluster_members.last_read_message_at`
(migration 0038), maintained by `mark_cluster_read` / `mark_all_read` and cleared
on join. It drives unread counts. The watermark is a cursor — it advances to
`now()` on every read — so it is **not** the read time shown in receipts.

Per-message read times live in `message_reads` (0049): one immutable
`(message_id, user_id, read_at)` row is written the first time a member's
watermark passes a message (inside `mark_cluster_read` / `mark_all_read`, same
transaction as the watermark advance). Both the backfill and every later
`mark_cluster_read` only record reads for messages sent after a member joined
(`created_at > joined_at`), so a member who joins after a message was sent is
listed under "Not seen yet" for it permanently — they were never present to read
it. Backfilled read times use the member's watermark as a frozen approximation
of their first read, not the true first-read instant (the live path records
`now()` exactly). `get_message_reads` (0049) exposes a message's readers to its
active members, guarded like `get_member_profiles`.

When a sender taps **Info** on their message (`RoomView` → `MessageInfoModal`),
`useMessageReads` fetches `get_message_reads` for that message; the pure helpers
in `src/pages/cluster/room/seen-by.ts` split readers into the seen list and the
remaining active members (author excluded) into the not-seen list. Every
`mark_cluster_read` also bumps the watermark, so the existing `cluster_members`
UPDATE realtime handler invalidates `['message-reads', clusterId]` and an open
dialog updates live — while each member's read time stays frozen at first read.

## Frontend Patterns

- **Routing**: declarative routes in `src/app/router.tsx`, with layout components (`AppShell`, `PublicLayout`, `ClusterLayout`) and guard components that redirect based on auth and onboarding state.
- **Server state**: every server read goes through a feature module that wraps TanStack Query. Components call hooks; they never talk to Supabase directly.
- **Typed client**: a single typed Supabase client instance in `src/lib/supabase.ts`, with a generated TypeScript type for the database in `src/lib/database.types.ts`.
- **Styling**: Tailwind utility classes restricted to the tokens in `docs/DESIGN.md`, mirrored into `src/index.css`. No new colors, typefaces, or radii outside the documented tokens.

## Database

All schema lives in `supabase/migrations/` and is **order-dependent**. Migrations build on each other and are never edited after they have been applied; changes come as new ordered files on top.

- **Core schema (0001-0010)**: enums, profiles, queues and clusters, chat, signals, status and availability, votes and member replacement, notifications, reports, and demo seed data.
- **Functions (0011-0015)**: matching, intro and social helpers, vote and replacement functions, and the pg_cron schedule.
- **Storage and permissions (0016-0020)**: storage buckets, grants, and fixes.
- **Realtime (0021-0024)**: chat, signal replies, governance events, and notification payloads.
- **Hardening (0025-0034)**: RLS and privilege tightening, account deletion, private storage buckets, member read access, avatar privacy, and discovery-in-cluster.
- **Moderation and platform roles (0052-0066)**: platform access primitives (`user_roles`, `account_restrictions`, `moderation_actions`), reports queue and claim/release/resolve workflow, content enforcement (hide/restore), warnings, temporary suspensions and permanent bans, platform role administration, staff status guards, and moderation workflow guards (claim locks, action-close-report, report validation, restriction lift no-ops). See [`ROLE_BASED_ACCESS_PLAN.md`](ROLE_BASED_ACCESS_PLAN.md) for the access model.
- **Posts (0072-0082)**: the standalone cluster posts surface — schema (`posts`, `post_comments`, `post_likes`, `comment_likes`), RPCs (create/edit/delete, like toggles, report, hide/restore), realtime, the private `posts-images` bucket, post/comment + like notifications, and the optional post title. See the Posts subsection above.

Every table has **Row Level Security enabled**. The frontend never writes tables directly except through Postgres RPC functions or RLS-permitted inserts. Privileged operations live in `security definer` functions guarded by grants, not by trusting the caller.

### Scheduled jobs

Database functions run on a pg_cron schedule, for example to expire stale signals or rebalance membership. The schedule is defined in a migration and is idempotent.

## Storage

Media is stored in private buckets and served through short-lived signed URLs, never through the public object URL.

| Bucket | Access rule |
|---|---|
| `chat-images` | readable only by active members of the owning cluster (`is_active_member(cluster_id)`) |
| `avatars` | readable by any authenticated user |
| `posts-images` | readable only by active members of the owning cluster (`is_active_member(cluster_id)`) |

The browser obtains a signed URL with a short TTL, uses it to render the image, and requests a fresh URL before expiry. Uploads store the bare storage path so URLs are never persisted. See `src/features/avatars.ts`, `src/features/cluster.ts`, and `src/features/posts.ts`.

## Auth

Authentication uses Supabase Auth with email and password. Account deletion leaves the clusters clean: the deleting user departs each cluster before the profile is removed (migration 0028). Moderation records survive deletion but are anonymized, because `reports`, `moderation_actions`, `account_restrictions`, and `user_roles` reference profiles with `on delete set null` (0052-0053).

## Security

Security lives in the database, not in the client. The browser holds only the public anon key and is never trusted; Row Level Security and RPC functions are the enforcement point. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the mental model.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | public anon (publishable) key |
| `VITE_KLIPY_APP_KEY` | no | KLIPY app key that enables the cluster chat GIF picker |
| `VITE_KLIPY_ENDPOINT` | no | KLIPY API base URL (defaults to `https://api.klipy.com/api/v1`); useful for pointing at a mirror in non-production |

Only the anon key is used in the browser. All privileged operations run through Postgres RPC functions guarded by Row Level Security. No secrets ship in the client.

Server-side email secrets live only in the `send-emails` Edge Function environment and the matching `email_settings` DB row seeded by the migration workflows:

| Variable | Environment | Used by |
|---|---|---|
| `RESEND_API_KEY` | staging + prod, edge fn env | `send-emails` → Resend |
| `RESEND_FROM` | `no-reply@thesensorium.online` | `send-emails` sender |
| `SENSORIUM_EMAIL_SECRET` | shared, per environment | DB cron header vs edge fn check |
| `SENSORIUM_APP_URL` | staging / prod | seed of `email_settings.app_url` (cron CTA links) |

## Local Development

The Supabase CLI starts the full stack in Docker (Postgres, API, Studio, Inbucket, Storage, Realtime) using `supabase/config.toml`. `npm run seed:demo` seeds demo users and a cluster. Run migrations from scratch with `supabase db reset`. See the [README](../README.md#getting-started) for the full local setup.

## CI and Deployment

### Git workflow

Sensorium uses a staging-driven Git workflow with two long-lived branches. `develop` is the shared preview branch; `main` is production.

```
feature/*
    ↓
develop
    ↓
main
```

- **`feature/*`** branches are cut from `develop` and get their own Vercel Preview deployment against the staging Supabase project. They never apply migrations directly.
- **`develop`** is the integration branch. External changes land via pull requests; core maintainers may commit directly. It deploys to the preview environment and applies pending migrations to the staging Supabase project on merge.
- **`main`** is production. Releases always go through a pull request from `develop` into `main`. Merging it deploys the production app and applies pending migrations to the production Supabase project.

### GitHub Actions

Three workflows validate and deploy:

- **`ci.yml`**: runs on push and pull requests to `main` and `develop`, and on push to `feature/**`, `fix/**`, and `docs/**`. It skips changes that only touch markdown or `docs/**`. When it runs, it runs lint, unit tests with the v8 coverage gate, the production build (artifact uploaded), applies migrations to a throwaway local Supabase stack, runs the integration suite, and runs the blocking Playwright E2E suite.
- **`migrate-staging.yml`**: applies pending migrations to the **staging** Supabase project on merge/push to `develop`, then deploys `send-emails` + sets its secrets and points the DB cron at the staging Edge Function.
- **`migrate-production.yml`**: applies the same migrations to the **production** Supabase project on merge/push to `main`, and does the same edge-function/secret/cron wiring for production.

### Deployments

A **single Vercel project** serves the app. `main` deploys to the Production environment against the production Supabase project; `develop` and every `feature/*` branch deploy to Preview environments against the staging Supabase project. SPA rewrites are defined in `vercel.json`.

The order matters: migrations land on staging first, are tested there, and only reach production through a `main` release. Feature branches never apply migrations directly; migration SQL lands on staging only when merged into `develop`, and on production when `develop` merges into `main`.

### GitHub Secrets

The migration workflows are environment-aware and expect the following repository secrets. Add these in **Settings → Secrets and variables → Actions**:

**Production**

| Secret | Purpose |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token (shared by both environments) |
| `SUPABASE_PROD_PROJECT_ID` | Production Supabase project reference |
| `SUPABASE_PROD_DB_PASSWORD` | Production database password for `db push` |
| `RESEND_API_KEY` | Resend API key for the `send-emails` edge function |
| `SENSORIUM_EMAIL_SECRET` | shared secret between the production DB cron and the edge function |

**Staging**

| Secret | Purpose |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token (reused) |
| `SUPABASE_STAGING_PROJECT_ID` | Staging Supabase project reference |
| `SUPABASE_STAGING_DB_PASSWORD` | Staging database password for `db push` |
| `RESEND_API_KEY` | Resend API key for the `send-emails` edge function |
| `SENSORIUM_EMAIL_SECRET` | shared secret between the staging DB cron and the edge function |

`RESEND_API_KEY` and `SENSORIUM_EMAIL_SECRET` are also required for production (same layout as the production table above, using the prod project ref).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | start the Vite dev server |
| `npm run build` | typecheck then build for production |
| `npm run preview` | preview the production build locally |
| `npm run lint` | run oxlint |
| `npm test` | run the Vitest suite |
| `npm run test:coverage` | run the unit suite and enforce the v8 coverage gate |
| `npm run test:integration` | run the integration suite against the local Supabase stack |
| `npm run test:watch` | run Vitest in watch mode |
| `npm run test:e2e` | run the Playwright suite |
| `npm run seed:demo` | seed the local database with demo data |

# Notification Deep-Link Plan

Goal: let a tap on a notification land on the exact message or comment that caused it, with the same scroll plus highlight feel as the existing cluster chat reply jump.

This is a small-medium change. Chat payloads already carry `message_id`; post payloads carry only `post_id` today, so posts need a small additive migration. No RLS change, no new notification type, no realtime publication change.

## 0. Where things stand

Frontend (web):

- `src/pages/cluster/RoomView.tsx:651` `flashJumpHighlight()`, `:660` `scrollMessageIntoView()`, `:675` `pageBackToParent()`, `:700` `handleJumpToReply()`. Same-page only, triggered by the quote button. Anchors are `id="message-<id>"` list items. Handles paging back up to 5 pages, deleted or unavailable parents, and reduced-motion.
- `src/pages/cluster/room/MessageItem.tsx:82` `jumpable` is true only when a visible parent exists; otherwise the quote renders inert fallback text.
- `src/features/notifications.ts:383` `notificationTarget()` deep-links coarsely: `message`/`mention`/`reaction` go to `/cluster/:id` (room top), `post_comment`/`post_like` go to `/posts/:postId` (post top). `payload.message_id` and per-comment identity are ignored.
- `src/pages/NotificationsPage.tsx:62` `handleClick` marks one row read then navigates via `notificationTarget()`. Rows stay visible as read history.
- `src/pages/posts/PostDetailPage.tsx:20` plus `src/components/CommentThread.tsx:1` render the post and all comments. `usePostComments` in `src/features/posts.ts:342` loads all comments for one post, oldest first, no pagination. Comments have no DOM anchors and no highlight state; only the composer scrolls (`CommentThread.tsx:61`).
- Routes in `src/app/router.tsx:198`: `/posts/:postId`, `/cluster/:clusterId` (index is `RoomView`).
- Tests: `src/pages/cluster/RoomView.test.tsx:480` (quote jump), `src/pages/NotificationsPage.test.tsx`, `src/features/notifications.test.tsx`, `src/components/CommentThread.test.tsx`.

Frontend (mobile, hand-mirrored):

- `mobile/app/(app)/cluster/[clusterId]/room.tsx:282` mirrors the web jump logic. `mobile/app/(app)/notifications.tsx` mirrors the center. `mobile/src/features/notifications.ts` is a synced copy of web. `mobile/src/features/realtime.ts` is pinned.
- Sync check: `node mobile/scripts/sync-db-types.mjs --check` after any shared-file change.

Backend (Supabase, migrations are immutable, add new ones only):

- Chat: `send_message()` (live body `0138_hot_write_rate_limits.sql:154`, broadcast extension `0155_mention_everyone.sql`) inserts `mention` rows with payload `{"message_id": v_msg_id}`. Reaction fan-out (`0024_notifications_m11.sql:94`) uses `{"message_id", "emoji"}`.
- Posts: `create_post_comment()` (live body `0139_child_cluster_id.sql:341`) inserts `post_comment` rows with payload `{"post_id": p_post_id}` only, for both the post-author notice and the parent-comment-author notice. `toggle_post_like()` (`0139:230`) inserts `post_like` with `{"post_id"}` only. `toggle_comment_like()` (`0139:267`) emits no notification.
- Read path: `get_my_notifications()` gates stored rows by `notification_allowed()` prefs, so `mentions` or `post_comment` opt-outs keep working with no extra code.
- Integration tests: `tests/integration/notifications.test.ts:406` asserts `payload.message_id`; posts notification coverage lives near `0080_posts_notifications.sql` behavior.

## 1. Locked decisions

1. **URL shape**: query params, not new routes. Chat: `/cluster/:id?message=<message_id>`. Post: `/posts/:postId?comment=<comment_id>`. Missing or unknown params fall back to current behavior (room top, post top). No hash fragments, so `useSearchParams` works the same on web and in the mobile router port.
2. **Highlight reuse**: chat reuses the existing ring (`ring-2 ring-primary`, 1600ms flash in `RoomView`). Posts add the same ring classes to the target comment wrapper. No new colors or radii per `docs/DESIGN.md`.
3. **Post payload**: additive only. `create_post_comment()` adds `comment_id` (the new row id `v_id`) alongside `post_id` in both `post_comment` inserts. `post_like` keeps `post_id` only. Old rows without `comment_id` still deep-link to the post top.
4. **No behavior change for prefs, badge, push, email**: fan-out rows, `notification_allowed()`, `get_my_notifications()`, `get_unread_notification_count()`, and the push/email outbox triggers are untouched except the extra JSON key.
5. **Copy**: no new user-facing copy except optional fallbacks ("That message is no longer available.", "That comment is no longer available."). Use hyphens only, no em dashes or en dashes in strings, comments, or docs.

## 2. Phase 1 - Backend migration `01NN_notification_deep_link.sql`

Why: security lives in the database; payload shape is owned by the RPC.

1. Re-issue `create_post_comment(p_post_id, p_content, p_image_url, p_gif_url, p_parent_comment_id)` by copying the `0139` body byte-for-byte (guards, `assert_account_can_write`, `is_active_member` plus `cluster_unlocked`, media and reply-target validation, self-like insert), changing only the two notification inserts:
   - post-author notice: `jsonb_build_object('post_id', p_post_id, 'comment_id', v_id)`
   - parent-comment-author notice: same shape with the same `v_id`
2. Keep `security definer`, `set search_path = public`, existing grants and rate limits. Do not touch `toggle_post_like`, `toggle_comment_like`, `send_message`, `notification_allowed`, `get_my_notifications`, RLS policies, or realtime publications.
3. Document in the migration comment that pre-migration rows lack `comment_id` and clients must fall back to post top.
4. Run `supabase db lint --local` and add the migration to the `docs/TECHNICAL.md` timeline.

Explicitly not changed: notification types, prefs columns, badge RPCs, push/email workers, `database.types.ts` by hand (regen, see phase 5).

## 3. Phase 2 - Web frontend, chat deep link

Files: `src/features/notifications.ts`, `src/pages/cluster/RoomView.tsx`, `src/pages/NotificationsPage.tsx` (no logic change, covered by target change).

1. `notifications.ts`:
   - Add small helpers `payloadMessageId(n)` and `payloadCommentId(n)` reading string ids from `n.payload`, returning null on missing or non-string.
   - `notificationTarget()`: for `message`/`mention`/`reaction`, return `/cluster/:id?message=<message_id>` when present, else the current `/cluster/:id`. For `post_comment`, return `/posts/:postId?comment=<comment_id>` when present, else the current `/posts/:postId`. `post_like` stays `/posts/:postId`. All other types unchanged.
2. `RoomView.tsx`:
   - Read `message` via `useSearchParams` on mount. When set and `messages.data` is loaded, reuse `handleJumpToReply` semantics: if rendered, `scrollMessageIntoView` plus highlight; if known but paged out, set `pendingJumpId` and reuse `pageBackToParent`; if unknown or deleted or muted-hidden, show the existing "no longer available" error path.
   - Clear the param after handling (replace navigation) so back or forward nav does not re-jump, and so the existing `pendingJumpId` effect (`RoomView.tsx:726`) stays the single scroll trigger.
   - Respect reduced-motion (already in `scrollMessageIntoView`) and keep the new-message pill and read-marker behavior unchanged.
3. Conventions: strict TypeScript, `@/` alias, Tailwind tokens from `docs/DESIGN.md` only, no em dashes or en dashes.

## 4. Phase 3 - Web frontend, post deep link

Files: `src/components/CommentThread.tsx`, `src/components/CommentItem.tsx`, `src/pages/posts/PostDetailPage.tsx`.

1. `CommentThread.tsx`:
   - Accept an optional `highlightCommentId` prop (or read `comment` search param in `PostDetailPage` and pass it down).
   - Render each top-level comment and nested reply wrapper with `id="comment-<id>"` and apply the shared highlight ring when matched, with a timed clear matching the chat 1600ms feel.
   - Add an effect: after `comments` load, if the target id is rendered, `scrollIntoView({ block: 'center' })` plus highlight; if the id is absent (deleted, moderated-hidden, muted), show an inline fallback note and stay at post top. No paging is needed because `usePostComments` loads the full list.
2. `PostDetailPage.tsx`: read `comment` via `useSearchParams`, pass to `CommentThread`, clear the param after handling (replace navigation).
3. `CommentItem.tsx`: accept an optional `highlighted` prop to keep the presentational change local; no logic change otherwise.

## 5. Phase 4 - Mobile mirror

Files: `mobile/src/features/notifications.ts` (synced copy), `mobile/app/(app)/notifications.tsx`, `mobile/app/(app)/cluster/[clusterId]/room.tsx`, `mobile/app/(app)/posts/[postId].tsx` (or current post detail route) plus comment components.

1. Regenerate shared copies via `cd mobile && npm run sync:db-types`, then port phases 2 and 3 line-for-line adapted to React Native (`FlatList` `scrollToIndex` or measured `scrollTo` instead of DOM `scrollIntoView`, same highlight border treatment as the existing mobile room).
2. Keep `mobile/src/features/realtime.ts` pinned; hand-reconcile only if the web realtime file changed (it does not in this plan).
3. Run `node mobile/scripts/sync-db-types.mjs --check` and commit regenerated copies.

## 6. Phase 5 - Types, seed, and docs

1. Regenerate `src/lib/database.types.ts` from the migrated schema (no codegen script in `package.json`; use the established local flow), then `cd mobile && npm run sync:db-types`.
2. Seed needs no change (`npm run seed:demo`); verify manually as `diya@demo.example` in Aurora: mention in chat, reply in chat, comment and reply on a post.
3. Update `docs/TECHNICAL.md` notification and posts paragraphs to note the new query params and the `comment_id` payload key. Core docs stay canonical; this plan file remains the design record.

## 7. Phase 6 - Tests

Unit (colocated, Vitest):

- `src/features/notifications.test.tsx`: `mention` with `message_id` targets `/cluster/:id?message=`, without it falls back to `/cluster/:id`; `post_comment` with `comment_id` targets `/posts/:postId?comment=`, legacy row without it falls back to `/posts/:postId`; `post_like` unchanged; non-string ids ignored.
- `RoomView.test.tsx`: mount with `?message=` renders and highlights the target;Paged-out parent pages back via the existing mock; unknown id shows the unavailable error.
- `CommentThread.test.tsx` (or `PostDetailPage` coverage): target comment gets the anchor id and highlight; unknown id stays at top with fallback; legacy behavior without param unchanged.

Integration (requires `supabase start`, sequential):

- Posts style: `create_post_comment` as non-author creates a `post_comment` row whose payload has both `post_id` and the new `comment_id`; reply notifies the parent-comment author with the reply row id; self-comment creates no row; `mentions: false` style pref check for `post_comment: false` hides the row in `get_my_notifications()`.
- Chat regression only: existing `notifications.test.ts:406` `payload.message_id` assertion still passes; no new chat fan-out.

E2E (requires `supabase start` plus `npm run seed:demo` plus `npx playwright install chromium`):

- Extend `e2e/notifications.spec.ts` pattern: seed a `mention` row with `message_id`, click it, assert room URL carries `?message=` and the target message is highlighted; seed a `post_comment` row with `post_id` plus `comment_id`, click it, assert post URL carries `?comment=` and the target comment is highlighted. Select by `data-e2e` attributes.

## 8. Verification

Pre-push per `AGENTS.md`:

- `npm run lint`
- `npm run test:coverage` (hard v8 gate: lines 34 percent, functions 33 percent, branches 20 percent; never lower thresholds)
- `npm run build` (`tsc -b` plus `vite build`)
- Migrations changed, so also `supabase db reset` plus `npm run test:integration`
- Shared files changed, so also `node mobile/scripts/sync-db-types.mjs --check`
- E2E for the touched paths: `npm run test:e2e` (or at minimum the notifications spec)

After realtime migration edits there are none here (no realtime publication change), so no `supabase stop && supabase start` cycle is needed beyond the normal reset.

## 9. Acceptance criteria

- Tapping a chat mention, reply, or reaction notification opens `/cluster/:id?message=<id>`, scrolls the exact message into view, and flashes the standard highlight; very old messages page back; deleted or unavailable messages show the existing fallback.
- Tapping a post comment or reply notification opens `/posts/:postId?comment=<id>`, scrolls the exact comment into view, and highlights it; legacy rows without `comment_id` land at post top.
- Tapping a post like notification behavior is unchanged (post top).
- Prefs off (`mentions`, `post_comment`) still hide those rows; badge counts unchanged; push and email unchanged.
- Web and mobile behave the same; all gates in section 8 pass.

## 10. Risks and edge cases

- Stale or deleted targets: chat reuses the existing unavailable path; posts need the same fallback so a deleted comment never strands the user.
- Muted authors and moderation-hidden content: target may exist but be invisible; treat as unavailable and do not reveal hidden content.
- Old notification rows predate `comment_id`: fallback to post top is required, not optional.
- Query param hygiene: clear after one jump so reloads and history moves do not re-scroll unexpectedly.
- Scope guard: no changes to signals, votes, DMs, staff surfaces, prefs schema, badge RPCs, or push or email pipelines.

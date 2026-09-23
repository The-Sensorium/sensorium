# Cluster Unread Badge Plan

Goal: show per-cluster unread chat counts on the cluster cards (Home and Clusters list, web + mobile) and stop synthesizing one `message` row per cluster in the notification center. Mentions, reactions, votes, invitations, signals, and post events stay in the center. The header badge counts stored rows only; chat is excluded because it lives on the cards (counting it in the tab double-counts and deep-links nowhere).

This is one phase, end to end: migration plus web plus mobile plus tests plus docs. No follow-up phase.

## 0. Where things stand

Backend (Supabase, migrations are immutable, add new ones only):

- `supabase/migrations/0134_notifications_unread_perf.sql:25`: live `get_my_notifications()` body. Stored rows (prefs filtered) `union all` one synthesized `message` row per cluster with unread chat (`chat_latest` via `DISTINCT ON`, `chat_counts` via `GROUP BY`, `LIMIT 100`).
- `0134:108`: live `get_unread_notification_count()` body. Cheap by design: stored-unread `COUNT` plus one `EXISTS` probe per cluster (`chat_clusters`). Badge counts 1 per chat cluster, not messages.
- `0134:21`: `messages_unread_idx on messages (cluster_id, created_at desc, id desc) where deleted_at is null and moderation_status = 'approved'`. The new RPC reuses this index, no new index needed.
- Watermark: `cluster_members.last_read_message_at`, advanced by `mark_cluster_read` / `mark_all_read` (bounded 2000-row receipt batches per `0154`, room screens throttled to one mark per 5s plus hide/background flush).
- Prefs: `notification_prefs.messages` gates chat visibility on the read path via `notification_allowed()` and the `my_clusters` CTE `(p is null or p.messages)`.
- No explicit grants needed for the new read RPC: `get_my_notifications()` / `get_unread_notification_count()` carry no per-function grants and rely on default execution plus `security definer` with `auth.uid()` scoping. The new function follows the same posture.

Frontend (web):

- `src/components/ClusterCard.tsx:15` (`ClusterCard`, `MemberClusterCard:59`): no unread prop, no badge. Home renders cards via `YourClusters` in `src/pages/HomePage.tsx:224`.
- `src/features/notifications.ts`: `useMyNotifications` (`get_my_notifications`), `useUnreadCount` (`get_unread_notification_count`), `useMarkClusterRead`, `useNotificationsChannel` (per-user channel, chat INSERT bump throttled to first-immediate plus trailing within 300ms, 60s background-paused poll, focus/reconnect refetch).
- `src/components/NotificationBell.tsx:8`, `UnreadBadge.tsx:1` (caps display at 9+).
- `notificationTarget` has a `message` case pointing at `/cluster/:id`; it becomes dead after the center stops returning `message` rows but stays as a safe fallback.

Frontend (mobile, hand-mirrored):

- `mobile/src/components/ClusterCard.tsx:15` (same shape, no badge), `mobile/app/(app)/home.tsx:298` renders cards.
- `mobile/src/features/notifications.ts`: mirrors `useMyNotifications` / `useUnreadCount`. `mobile/src/features/realtime.ts` is pinned and reconciled by hand, do not blind-copy.
- `mobile/scripts/sync-db-types.mjs` copies `src/lib/database.types.ts` plus shared modules; never hand-edit generated mobile copies.

Tests:

- Web colocated: `src/features/notifications.test.tsx`, room tests around `mark_cluster_read`.
- Integration (Node, live stack): `tests/integration/notifications.test.ts`, `push.test.ts`, `privileges.test.ts`.
- E2E (Playwright, `data-e2e` selectors): cluster room, notifications specs.

## 1. Locked decisions

1. One new RPC: `get_unread_chat_counts()` returning `(cluster_id uuid, unread_count bigint)`, one row per cluster with unread > 0, missing row means 0. Single call for all clusters, never one call per card.
2. Counts are exact message counts (same `GROUP BY` semantics as existing `chat_counts`), client caps display at `9+`. No server-side cap in v1; beta scale is a few clusters per user with the `messages_unread_idx` covering the scan. Revisit a `LIMIT`-capped count only with measured evidence.
3. Center drops plain `message` rows only. `mention` (including `@everyone` broadcast), `reaction`, votes, invitations, signals, post events stay. Members who disable `messages` but keep `mentions` still see mentions.
4. Header badge counts stored unread only. Chat is excluded: it lives on the cards, and tab-badging it double-counts entries the center does not show. This replaces the `0114` invariant (badge equals rows shown) with: header equals stored unread, cards carry chat.
5. Same realtime strategy, no new channels or polls: the new query uses the existing `['notifications', 'unread']` invalidation path (message INSERT bump, 300ms throttle, 60s background-paused poll, focus/reconnect).
6. No new colors, typefaces, or radii. Badge reuses `UnreadBadge` styling on web and theme tokens (`t.primary`, `radii.pill`) on mobile.

## 2. Backend migration `0156_cluster_unread_counts.sql`

Why: security lives in the database; unread math must stay in SQL next to the watermark and prefs.

1. Create the counts function (same CTE shape as `0134`, same index):
```sql
create function public.get_unread_chat_counts()
returns table (
  cluster_id uuid,
  unread_count bigint
)
language sql stable security definer set search_path = public as $$
  with my_clusters as (
    select cm.cluster_id, cm.last_read_message_at
    from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    left join public.notification_prefs p
      on p.user_id = cm.user_id and p.cluster_id = cm.cluster_id
    where cm.user_id = auth.uid()
      and cm.left_at is null
      and c.introductions_completed_at is not null
      and (p is null or p.messages)
  )
  select mc.cluster_id, count(m.id) as unread_count
  from my_clusters mc
  join public.messages m on m.cluster_id = mc.cluster_id
  where m.deleted_at is null
    and m.moderation_status = 'approved'
    and m.author_id <> auth.uid()
    and m.created_at > mc.last_read_message_at
  group by mc.cluster_id;
$$;
```
2. Re-issue `get_my_notifications()` by copying the `0134` body and deleting only the chat branch: drop the `chat_latest` / `chat_counts` CTEs and the second `union all` select, keep stored-rows select with `notification_allowed()` filter, ordering, and `LIMIT 100` unchanged. Return columns unchanged so `database.types.ts` shape is stable.
3. Re-issue `get_unread_notification_count()` as stored unread only (no chat
sum): plain chat lives on the cards, and tab-badging it would double-count
entries the center no longer shows.
```sql
create or replace function public.get_unread_notification_count()
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*)
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
    and n.read_at is null
    and n.type not in ('report_new', 'appeal_new')
    and public.notification_allowed(p, n.type, n.cluster_id);
$$;
```
4. Keep `security definer`, `set search_path = public`, no new grants (same posture as the functions it replaces).
5. Run `supabase db lint --local`, then `supabase db reset` to prove ordering from scratch.

Explicitly not changed: `send_message` fan-out, push/email workers and triggers, `notification_allowed()`, `mark_cluster_read` / `mark_all_read`, RLS policies, rate limits, `messages_unread_idx`.

## 3. Web frontend

Files: `src/features/notifications.ts`, `src/components/ClusterCard.tsx`, `src/components/UnreadBadge.tsx` (reuse), `src/pages/HomePage.tsx`, clusters list page wiring.

1. Add to `src/features/notifications.ts`:
   - Type `UnreadChatCount = { cluster_id: string; unread_count: number }`.
   - `useUnreadChatCounts(enabled = true)`: query key `['notifications', 'unread-chat', userId]`, same refetch strategy as `useUnreadCount` (60s background-paused poll, focus/reconnect, no new intervals). Query fn calls `supabase.rpc('get_unread_chat_counts')` and returns a `Map<string, number>`.
   - Extend the invalidation sites that already bump `['notifications', 'unread']` (`useMarkClusterRead.onSuccess`, `useMarkAllNotificationsRead.onSuccess`, `useNotificationsChannel` notification INSERT and throttled `bumpChat`) to also invalidate `['notifications', 'unread-chat']`. No new subscriptions.
2. `ClusterCard` / `MemberClusterCard`: add optional `unreadCount?: number` prop. When `unreadCount > 0`, render the existing `UnreadBadge` next to the message icon (cap `9+`, `aria-label` like `3 unread messages`). When 0 or undefined, render nothing. No new tokens.
3. Home (`YourClusters`) and the clusters list: call `useUnreadChatCounts` once per list, pass `map.get(item.cluster.id) ?? 0` into each card. One hook call per list, never per card.
4. Center: no code change needed once the RPC stops returning `message` rows, but remove any `message`-specific empty-state copy if it references chat. Keep the `notificationTarget` `message` case as a dead-safe fallback.
5. Tests: extend `src/features/notifications.test.tsx` (new hook fetches via `get_unread_chat_counts`, invalidations fire on mark-read and channel bumps); add `ClusterCard` badge render test (0 hides, 3 shows, 12 shows `9+`).

## 4. Mobile frontend

Mirror of web, by hand (realtime file stays pinned):

1. `mobile/src/features/notifications.ts`: same `useUnreadChatCounts` (same key shape, same poll/focus strategy adapted to React Native lifecycle already used by `useUnreadCount`).
2. `mobile/src/components/ClusterCard.tsx`: same `unreadCount` prop, badge with `t.primary` pill, `maxFontSizeMultiplier={1.4}`, `accessibilityLabel` matching web.
3. `mobile/app/(app)/home.tsx` and `mobile/app/(app)/clusters.tsx`: one hook call per list, pass counts down.
4. Wire the same invalidation keys in the mobile channel handlers that bump unread today.
5. Tests: new `mobile/src/lib/` or feature-adjacent test file colocated with what it covers, mirroring the web hook tests with `expo` modules mocked (see `mobile/src/lib/upload-image.test.ts` for the mock pattern).

## 5. Realtime and load strategy

- No new Supabase Realtime channels. The `user:${userId}` channel plus per-cluster `useClusterChannel` bumps already cover message INSERTs; the new query rides those invalidations.
- No extra polling. Same 60s background-paused poll as unread. A chat burst costs one refetch of the counts key per 300ms window (throttled `bumpChat` invalidates only `['notifications', 'unread-chat']`; mentions additionally fire the stored-row handler that refreshes list plus badge).
- No N+1. Review must reject any per-card `useUnreadChatCounts(clusterId)` or per-card `rpc` call.
- Writes unchanged. Opening a room still advances the watermark via the throttled `mark_cluster_read`; the badge clears on the next invalidation exactly like today.

## 6. Tests

- Unit (colocated, Vitest): new hook tests web + mobile, `ClusterCard` badge tests web + mobile, prefs test (messages-off cluster yields no row).
- Integration (`tests/integration/`, requires `supabase start`): seed two members in a cluster, send 3 messages from member A, assert `get_unread_chat_counts()` returns 3 for member B and 0 rows for A; set `messages=false` pref for B and assert no row; `mark_cluster_read` clears; `get_my_notifications()` returns no `message` rows but keeps a `mention` row; `get_unread_notification_count()` stays 0 for plain chat and counts the stored `mention` row.
- E2E (Playwright, `data-e2e`): add `data-e2e="cluster-unread-badge"` with per-card identifier to web cards; spec: A sends message, B sees badge `1` on home without opening the room, B opens the room, badge clears on return. Keep selectors on `data-e2e` only.
- Gates: `npm run lint`, `npm run test:coverage` (never lower thresholds in `vite.config.ts`), `npm run build`, `supabase db reset` plus `npm run test:integration`, mobile `npm test` plus `npm run lint --prefix mobile`.

## 7. Types, sync, docs

1. Regenerate `src/lib/database.types.ts` from the migrated schema (no codegen script in `package.json`; use the Supabase CLI types command against the local stack) and commit it.
2. Run `node mobile/scripts/sync-db-types.mjs --check`; if a synced web file changed, commit the regenerated mobile copies (run without `--check` to regenerate, then re-check).
3. Update `docs/TECHNICAL.md` migration timeline with `0156` (counts RPC, center drops chat synthesis, header badge stored-only). Update this plan status when shipped. Do not edit applied migrations.

## 8. Verification and rollout

1. `supabase start`, `supabase db reset`, `npm run seed:demo`.
2. Full gates per AGENTS.md pre-push (lint, coverage, build; integration because a migration changed; mobile tests/lint because mobile files changed).
3. Manual on staging (`develop` merged, preview deployment): two test users in one cluster, A sends text plus photo plus GIF, B checks home badge counts, opens room, badge clears; C with `messages=false` sees no badge but still gets a mention row; header badge stays quiet for plain chat and counts stored rows (mentions) only.
4. Release `develop` to `main` through a PR with `npm run check:release` passing first; migrations reach production only via that merge.

## 9. Rollback

- Frontend revert is safe: old build without the badge works against the new DB (new RPC ignored, center simply shows fewer rows).
- Backend rollback is a forward migration, never a restore: if counts misbehave, re-issue `get_my_notifications()` from the `0134` body to restore chat synthesis and revert the badge body to the `EXISTS` version. Keep both bodies in the migration comments for reference.
- The one broken beta image stays broken (stored bytes are final); affected testers re-send.

## Explicitly not changed

Push fan-out, email outbox, rate limits, read receipts (`message_reads`), post/comment surfaces, staff notification pipelines, realtime publications, storage buckets and policies.

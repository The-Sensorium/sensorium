# Scalability Implementation Plan — Pre-launch Review

> Source: performance/scalability review of `C:\Users\emath\source\repos\the-sensorium\sensorium`.
> No code changed. This is a plan only.
>
> Migration rule (from `AGENTS.md`): **never edit an applied migration — add a new `NNNN_*.sql` migration**. After schema/RPC changes, regenerate `src/lib/database.types.ts` and run `node mobile/scripts/sync-db-types.mjs --check` if synced files changed. After realtime migration changes, `supabase stop && supabase start`.

Execution order below is the recommended fix order (highest launch-risk / lowest-risk-quick-win first). IDs are stable: `S-01…S-14`.

---

## S-01 — Global `messages` realtime fan-out + double 30s notification poll

**Current problem:** every connected client subscribes to all `messages` inserts DB-wide, then each does 2x expensive RPCs every 30s even when idle. Thundering herd as users grow.

**Exact files/functions:**
- `src/features/notifications.ts:18-29` `useMyNotifications` (`refetchInterval: 30_000`)
- `src/features/notifications.ts:32-47` `useUnreadCount` (`refetchInterval: 30_000`)
- `src/features/notifications.ts:312` (approx) `useNotificationsChannel` — `.on('postgres_changes', { table: 'messages' })` with no `filter`
- `supabase/migrations/0115_chat_notification_count.sql`, `0116_notifications_unread_only.sql` (`get_my_notifications()`), `0114_unread_count_consistent.sql` (`get_unread_notification_count()`)

**Proposed fix:**
1. Remove global `messages` postgres_changes subscription. Rely on per-cluster `useClusterChannel(clusterId)` (`src/features/realtime.ts`) + existing `notifications` INSERT invalidation.
2. Remove `refetchInterval` from `useMyNotifications`/`useUnreadCount`. Keep `refetchOnWindowFocus: true`, `refetchOnReconnect: true` (same pattern staff badge already uses at `notifications.ts:61-77`).
3. Merge badge+center fetch where both mounted (single RPC call, share cache via `queryClient`), or keep separate keys but realtime-driven.

**Indexes/migrations required:** none for this item alone (see S-02 for RPC optimization).

**Functional impact:** badge/center update path changes from poll to realtime. Risk of stale badge if realtime drops — mitigated by focus/reconnect refetch. No schema change. E2E `notifications.spec` must still pass.

**Risk:** **Medium** (behavioral — missed realtime = stale badge; needs fallback).

---

## S-02 — `get_my_notifications()` window over all unread; badge does full inbox work

**Current problem:** `get_my_notifications()` computes `row_number() / count(*) OVER (PARTITION BY cluster_id)` over *all* unread before filtering to `rn=1 LIMIT 100`. Badge (`SELECT count(*) FROM get_my_notifications() WHERE read_at IS NULL`) pays full cost. Away-for-weeks user = 1000s-row sort per poll per tab.

**Exact files/functions:**
- `supabase/migrations/0115_chat_notification_count.sql`, `0116_notifications_unread_only.sql`, `0133_notifications_seen_vs_clear.sql` (`get_my_notifications()`)
- `supabase/migrations/0114_unread_count_consistent.sql:12-18` (`get_unread_notification_count()`)
- Callers: `src/features/notifications.ts:24,42`

**Proposed fix (new migration, e.g. `0134_notifications_unread_perf.sql`):**
1. Add lightweight `get_unread_notification_count()` that does separate cheap `COUNT`s (no window fns).
2. Rewrite `unread_chat` CTE to per-cluster lateral latest:
```sql
SELECT DISTINCT ON (cm.cluster_id) ...
FROM cluster_members cm
JOIN LATERAL (
  SELECT * FROM messages m
  WHERE m.cluster_id = cm.cluster_id
    AND m.created_at > cm.last_read_message_at
    AND m.deleted_at IS NULL
    AND m.moderation_status = 'approved'
  ORDER BY m.created_at DESC, m.id DESC LIMIT 1
) m ON true ...
```
3. Keep `LIMIT 100` + final `ORDER BY created_at DESC`.

**Indexes/migrations required (same migration):**
```sql
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON messages (cluster_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND moderation_status = 'approved';
```

**Functional impact:** same 100-row result shape, cheaper plan. Must verify `count(*) OVER` title string ("N new messages") still correct or recomputed. Affects notification center + badge only.

**Risk:** **Medium** (SQL rewrite; needs `EXPLAIN` + integration `tests/integration/notifications.test.ts`).

---

## S-03 — `get_my_matching_status()` full-table GROUP BY + 15s poll per card

**Current problem:** `counts AS (SELECT mode,queue_key,count(*) FROM queue_entries GROUP BY)` scans entire queue table on every call. `useQueueCount` polls every 15s per mounted card + opens a broadcast channel whose `count` payload the backend never sends, so poll never resolves to push.

**Exact files/functions:**
- `supabase/migrations/0132_open_mix_queue_cooldown.sql` (`get_my_matching_status()`), `0018_get_my_matching_status.sql`, `0034_discovery_in_cluster.sql`
- `supabase/migrations/0011_matching_functions.sql` (`maybe_form_cluster()` — sends `pg_notify` with no count)
- `src/features/matching.ts:10-25` `useMyQueueStatus`, `src/features/matching.ts:114-153` `useQueueCount` (`refetchInterval: 15_000`, `channel('queue:...')`)
- Callers: `src/pages/discovery/ModePanel.tsx:142,206`, `src/components/QueueCard.tsx:19`

**Proposed fix:**
1. New migration: scope counts to caller's keys:
```sql
SELECT mode, queue_key, count(*) FROM queue_entries
WHERE (mode, queue_key) IN (SELECT mode, queue_key FROM <caller keys CTE>)
GROUP BY 1,2
```
or 5x lateral indexed `COUNT(*)`.
2. Fix `maybe_form_cluster` to broadcast actual count, or switch frontend to `postgres_changes` on `queue_entries` filtered by key.
3. Frontend: single shared `useQueueCount` per `queueKey` (dedupe like `presenceStore`), poll 60s+ with jitter as fallback only, `refetchInBackground: false`.

**Indexes/migrations required:**
```sql
CREATE INDEX IF NOT EXISTS queue_entries_mode_key_joined_idx
  ON queue_entries (mode, queue_key, joined_at);
```

**Functional impact:** Discovery/queue counts only; shape unchanged. Broadcast payload change must stay backward-compatible (`{count?:number}` already optional).

**Risk:** **Low-Medium** (localized RPC + client polling change).

---

## S-04 — No route code-splitting; staff + LiveKit in initial bundle

**Current problem:** `src/app/router.tsx:1-58` statically imports ~30 pages including 17–27k staff pages + `@livekit/components-react` + fonts. Every visitor downloads admin/moderator/call code. `vite.config.ts` has no `manualChunks`.

**Exact files:**
- `src/app/router.tsx:1-58`
- `vite.config.ts:1-9`
- Heavy leaves: `src/pages/staff/ModerationRolesPage.tsx`, `AdminAppealCasePage.tsx`, `ModerationQueuePage.tsx`, `ModerationAuditPage.tsx`, `src/pages/cluster/RoomView.tsx`, `src/features/cluster-calls.ts`

**Proposed fix:**
1. `React.lazy()` per route + `<Suspense>` at layout level, e.g. `const RoomView = lazy(() => import('../pages/cluster/RoomView'))`.
2. `build.rollupOptions.output.manualChunks: { livekit, staff, vendor/query/supabase }`.
3. Verify `mobile/` unaffected (web-only change).

**Indexes/migrations required:** none.

**Functional impact:** load timing / chunk boundaries only. Loading fallback UI needed. No behavior change if fallback handled. Check `vercel.json` caching still valid.

**Risk:** **Low** (build-only; verify with `npm run build` + smoke).

---

## S-05 — Cron full-scans + row-by-row long transactions

**Current problem:** `close_expired_votes`, `check_intro_deadlines`, `expire_invitations`, `progress_replacements` all `FOR x IN SELECT * WHERE expired LOOP` + 4–6 queries per row + notification fan-out in one txn, no `LIMIT`/`SKIP LOCKED`/advisory lock. Long lock hold, timeouts, duplicate work on retry. Schedules in `0015_cron.sql`, `0039_cron_idempotent.sql`.

**Exact files/functions:**
- `supabase/migrations/0013_vote_functions.sql` + `0132_open_mix_queue_cooldown.sql` (`close_expired_votes()`)
- `supabase/migrations/0012_intro_social_functions.sql` (`check_intro_deadlines()`)
- `supabase/migrations/0014_replacement_functions.sql` (`progress_replacements()`, `expire_invitations()`, `source_candidates()`, `fn_candidate_eligible()`)
- `supabase/migrations/0015_cron.sql`, `0039_cron_idempotent.sql`
- `supabase/migrations/0071_email_pump_cron.sql` (check claim index coverage)

**Proposed fix (new migration):**
1. `... ORDER BY <deadline> LIMIT 100 FOR UPDATE SKIP LOCKED` in each loop.
2. `pg_advisory_xact_lock(hashtext('<job-name>'))` at top of each pump.
3. Batch notification inserts; `SET LOCAL statement_timeout`.
4. Separate item S-06 covers `source_candidates` rewrite.

**Indexes/migrations required (same or follow-up migration):**
```sql
CREATE INDEX IF NOT EXISTS votes_open_due_idx ON votes (status, closes_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS replacement_rounds_status_idx ON replacement_rounds (status);
CREATE INDEX IF NOT EXISTS invitations_pending_expires_idx ON invitations (status, expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS clusters_intro_deadline_idx ON clusters (status, introductions_deadline) WHERE status = 'introductions';
```

**Functional impact:** job throughput/locking only. Must keep exactly-once effects (vote close must not double-apply `start_replacement`). Needs idempotency test (`tests/integration/governance.test.ts`, `matching.test.ts`).

**Risk:** **Medium** (concurrency semantics; test with `supabase db reset + test:integration`).

---

## S-06 — `source_candidates()` per-row eligibility function blocks index use

**Current problem:** `WHERE fn_candidate_eligible(q.user_id,...)` (3x `EXISTS` per queue row) prevents index use; second branch scans whole mode to top-up to 3. Called from `start_replacement`, `advance_round`, cron.

**Exact files:**
- `supabase/migrations/0014_replacement_functions.sql:75-170` (`source_candidates()`), `:3-25` (`fn_candidate_eligible()`)

**Proposed fix (new migration):** inline as joins:
```sql
SELECT q.user_id FROM queue_entries q
JOIN profiles pr ON pr.id = q.user_id AND pr.onboarding_completed_at IS NOT NULL
LEFT JOIN mode_cooldowns mc ON mc.user_id = q.user_id AND mc.mode = v_round.mode AND mc.available_at > now()
WHERE q.mode = v_round.mode AND q.queue_key = v_cluster_key
  AND mc.user_id IS NULL
  AND NOT q.user_id = ANY (v_round.declined_user_ids)
  AND NOT EXISTS (SELECT 1 FROM cluster_members cm JOIN clusters c ON ... WHERE cm.user_id = q.user_id ...)
ORDER BY q.joined_at LIMIT 3;
```
Uses `queue_entries_mode_key_joined_idx` from S-03 plus existing `mode_cooldowns(user_id,mode)`.

**Indexes/migrations required:** reuse S-03 index; verify `mode_cooldowns(user_id,mode)`, `cluster_members(user_id) WHERE left_at IS NULL` exist, else add.

**Functional impact:** candidate selection results must be identical (same eligibility). High-value correctness test: `tests/integration/matching.test.ts`, `governance.test.ts`.

**Risk:** **Medium-High** (query semantics; wrong join = wrong candidates).

---

## S-07 — Push wake per notification row

**Current problem:** `fan_out_push_notification()` is `AFTER INSERT FOR EACH ROW` + `wake_push_worker() -> net.http_post`. 8-member fan-out = 8 HTTP posts inside user txn; 8 `send-push` workers race for same rows. Per-token rewrite (`0102`) multiplies rows by device count, worsening it.

**Exact files:**
- `supabase/migrations/0100_push_outbox.sql`, `0102_push_outbox_per_token.sql`, `0103_push_instant_wake.sql` (`fan_out_push_notification()`, `wake_push_worker()`)
- `supabase/functions/send-push/index.ts:150-175`
- Producers: `0012/0013/0014` vote/replacement notifies, `0024/0033/0046` `send_message`, `0080_posts_notifications.sql`

**Proposed fix (new migration):**
1. Change trigger to `AFTER INSERT ... FOR EACH STATEMENT` calling `wake_push_worker()` once, or guard with `pg_try_advisory_xact_lock('push-wake')`.
2. Keep per-token rows (correct for multi-device), drop per-row wake.

**Indexes/migrations required:** none for wake fix (see S-10 for outbox indexes).

**Functional impact:** push latency path only. Risk of missed wake if statement trigger misfires — pump cron (`0071`-equivalent for push) remains as fallback. Verify `tests/integration/push.test.ts`.

**Risk:** **Low-Medium** (delivery timing; fallback cron covers).

---

## S-08 — Missing rate limits on hot writes; call-token does 5 round-trips

**Current problem:** `0126` only limits reports/appeals (via unindexed `count(*)`). Free to script: `join_queue`, `send_message`, `vote_on`, `toggle_*`, call-token mint (LiveKit cost). `create-call-token` also parses JWT `sub` without in-function verify (relies on gateway).

**Exact files:**
- `supabase/migrations/0126_moderation_rate_limits_sla_ops.sql`
- Uncovered: `0011 (join_queue/leave_queue)`, `0046/0024/0033 (send_message)`, `0013 (vote_on)`, `0106 (toggle_message_reaction)`, `0073/0080 (toggle_post_like)`, `0082/0099 (comment likes)`
- `supabase/functions/create-call-token/index.ts:168-226`
- `supabase/config.toml` (`verify_jwt` expectation)

**Proposed fix:**
1. New migration: generic `rate_limits(user_id, action, window, count)` token-bucket (or per-action tables), checked in `join_queue`, `send_message`, `vote_on`, `toggle_*`, call-token context RPC. Suggested starts: 20 queue joins/hr, 60 messages/hr, 10 votes/hr, 10 call mints/10min.
2. New `get_call_token_context(p_call_id)` security-definer RPC returning `(is_member, is_participant, cluster_status, display_name)` in 1 round-trip; document/verify `verify_jwt=true`.
3. Fix existing limit checks to `SELECT 1 ... LIMIT N` / `EXISTS` + indexes:
```sql
CREATE INDEX IF NOT EXISTS reports_reporter_created_idx ON reports (reporter_id, created_at DESC);
-- same pattern for appeals
```

**Indexes/migrations required:** as above + rate-limit table/index.

**Functional impact:** legitimate bursts may hit limits — needs UX copy ("slow down") + `429`-style error mapping in `src/lib/error.ts`, `src/features/*` mutations. Call-token path changes from 5 REST calls to 1 RPC.

**Risk:** **Medium** (can block legit users if thresholds wrong; start permissive + log).

---

## S-09 — Unfiltered child-table realtime + per-event `cluster_id` lookup

**Current problem:** `message_reactions`, `signal_replies`, `post_likes`, `post_comments`, `comment_likes`, `call_participants` have no `cluster_id`, so Realtime cannot filter by cluster. Every event wakes every client in every cluster, then each client does an extra `select cluster_id` to route it (`patch*` helpers). Chat burst = N x N lookups.

**Exact files:**
- `src/features/realtime.ts:22-179` (`patchReaction`, `patchSignalReply`, `patchPostLike`, `patchPostComment`, `patchCommentLike`, `patchCallParticipants`), `:187-502` (`useClusterChannel`, ~25 handlers)
- `src/features/cluster.ts:141-162` (notes missing `cluster_id`), `src/features/posts.ts:189`
- RLS: `0004_chat.sql:56-60`, `0005_signals.sql:37-46`, `0007_votes_replacement.sql:61-66`, `0072_posts_schema.sql:117-151`
- `0021_realtime_chat.sql`, `0023_governance_realtime.sql`, `0074_posts_realtime.sql`

**Proposed fix (new migration + frontend):**
1. Migration: `ALTER TABLE <child> ADD COLUMN cluster_id uuid REFERENCES clusters(id)`, backfill from parent (`messages`/`signals`/`posts`/`comments`), `NOT NULL` + FK index, keep in sync via trigger on insert.
2. Update RLS to `USING (is_active_member(cluster_id))` (sargable, no per-row parent subselect).
3. Frontend: add `filter: cluster_id=eq.X` to those handlers, delete `patch*` lookups.
4. Mount `useClusterChannel` once in `ClusterLayout` (ref-count like `presenceStore`), split high-frequency (messages/typing) vs low-frequency (votes/rounds).

**Indexes/migrations required:**
```sql
CREATE INDEX IF NOT EXISTS message_reactions_cluster_idx ON message_reactions (cluster_id);
CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON message_reactions (message_id);
CREATE INDEX IF NOT EXISTS signal_replies_signal_idx ON signal_replies (signal_id, created_at);
CREATE INDEX IF NOT EXISTS signal_replies_cluster_idx ON signal_replies (cluster_id);
CREATE INDEX IF NOT EXISTS vote_responses_vote_idx ON vote_responses (vote_id);
CREATE INDEX IF NOT EXISTS post_likes_post_idx ON post_likes (post_id);
CREATE INDEX IF NOT EXISTS comment_likes_comment_idx ON comment_likes (comment_id);
CREATE INDEX IF NOT EXISTS cluster_members_cluster_idx ON cluster_members (cluster_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS message_reads_user_idx ON message_reads (user_id);
```

**Functional impact:** schema + RLS + realtime topology change. Affects chat/reactions/replies/likes everywhere + `mobile/src/features/realtime.ts` (pinned copy — reconcile by hand per `AGENTS.md`). Backfill must be batched on large tables.

**Risk:** **High** (migration + RLS + realtime + mobile sync; needs `supabase db reset + test:integration + test:e2e`).

---

## S-10 — Growing `.in()` fan-out; feed loads all likes/comments to rank slice

**Current problem:** reactions/likes/comments fetched as `select * ... .in(ids)` where `ids` = all loaded pages. PostgREST URL cap + per-row RLS = slow then 414. `sortPostsForFeed('top')` ranks only the fetched slice, so "top" is wrong once paginated. `['post-comments',clusterId,'all']` key ignores `postIds`, widening silently.

**Exact files:**
- `src/features/cluster.ts:145-162` (`useClusterReactions`), `RoomView.tsx:70,383-389`
- `src/features/posts.ts:57-150,171-311` (`useClusterPosts`, `useClusterPostLikes`, `useClusterCommentLikes`, `useClusterPostComments`, `usePostImageUrl`), `sortPostsForFeed`
- `src/pages/posts/PostsFeedPage.tsx:46-47`, `src/pages/cluster/RoomView.tsx:74-76`, `SignalsView.tsx:36-37`, `VotesView.tsx:40-41`
- `src/features/signals.ts:10-68`, `src/features/votes.ts:13-54,32-54`

**Proposed fix:**
1. Short-term (no migration): chunk `ids` ≤50, `select` narrow columns (`message_id,user_id,emoji`, not `*`), include cursor in query key, scope votes/replies to open ids only.
2. Proper fix (new migration + RPC): `get_post_feed(p_cluster_id, p_limit, p_cursor)` returning posts + `likes_count, comments_count` via `GROUP BY`; per-post comments `LIMIT 20` + cursor. Same for `get_vote_counts(cluster_id)`, `get_signal_reply_counts(cluster_id)`.
3. Frontend: `VotesView.tsx:209` use existing `castCountByVote` map instead of per-card `.filter()` (O(V*R) render loop).

**Indexes/migrations required:** covered by S-09 indexes; feed RPC needs existing `posts(cluster_id,created_at)` (verify in `0072`) + new function (no new index beyond S-09).

**Functional impact:** feed/signal/vote ranking and counts. "Top" sort will change (fix — currently slice-local). Pagination keys change, invalidating old caches (acceptable).

**Risk:** **Medium** (RPC contract + cache-key change; needs feed integration tests `tests/integration/posts.test.ts`).

---

## S-11 — `mark_cluster_read` / `mark_all_read` unbounded write

**Current problem:** `INSERT INTO message_reads SELECT ... WHERE created_at > v_prev` inserts 1000s of rows in one txn on return; `mark_all_read` spans all clusters + `DELETE FROM notifications` full history. Called on every `messages.data` change while pinned (`RoomView.tsx:395-402`, 400ms debounce) = write per burst.

**Exact files:**
- `supabase/migrations/0049_message_reads.sql` (`mark_cluster_read()`, `mark_all_read()`), `0038_last_read_chat.sql`, `0048_read_receipts.sql`, `0133_notifications_seen_vs_clear.sql`
- `src/pages/cluster/RoomView.tsx:395-402`, `src/features/cluster.ts` read helpers
- `src/features/notifications.ts` (Mark all read)

**Proposed fix:**
1. Cap with `LIMIT 2000` + client loop, or prefer `p_message_ids uuid[]` param (freeze only rendered window).
2. Throttle `mark_cluster_read` to ~5s + `visibilitychange`, not per-message-batch.
3. Keep `DELETE` scoped (do not wipe audit history needed elsewhere).

**Indexes/migrations required:**
```sql
CREATE INDEX IF NOT EXISTS messages_cluster_created_idx
  ON messages (cluster_id, created_at) WHERE deleted_at IS NULL;
-- plus message_reads_user_idx from S-09
```

**Functional impact:** read receipts / unread counts timing. Capping could leave very stale users partially unread until next call — client must loop until `added < limit`.

**Risk:** **Low-Medium** (receipt semantics; easy to verify in `read-receipts.test.ts`).

---

## S-12 — Outbox pumps miss `failed` index; Edge workers serial

**Current problem:** queue indexes cover `('queued','sending')` but claim predicate includes `(failed AND attempts<5)` → retries seq-scan when unhealthy. Pump claims ≤20–50/min; worker sends serially (20 Resend RTTs + 20 marks ≈ 8s+) → `sending`-stuck → requeue loop.

**Exact files:**
- `supabase/migrations/0068_email_outbox.sql` (`claim_outbound_emails`), `0100_push_outbox.sql` (`claim_push_notifications`), `0101_email_outbox_retry.sql`, `0071_email_pump_cron.sql`
- `supabase/functions/send-emails/index.ts:115-129`, `supabase/functions/send-push/index.ts:150-175`

**Proposed fix (migration + functions):**
```sql
CREATE INDEX IF NOT EXISTS outbound_emails_retry_idx
  ON outbound_emails (status, attempts, created_at) WHERE status IN ('queued','failed');
-- same for push_outbox
```
Worker: `Promise.allSettled` concurrency 5 (p-limit), batch marks, claim 100, run every 30s or self-invoke while `claimed.length == limit`.

**Indexes/migrations required:** as above.

**Functional impact:** email/push delivery throughput/latency only. Duplicate-send risk if concurrency + claim overlap — claims must remain `FOR UPDATE SKIP LOCKED`.

**Risk:** **Low-Medium** (background path; verify `tests/integration/emails.test.ts`, `push.test.ts`).

---

## S-13 — Directory + signals/votes fetch closed history every mount

**Current problem:** `get_clusters_by_mode()` has no `LIMIT/OFFSET` + per-row correlated `count(*)`; client renders all cards. Room mounts signals+replies+votes even though only open ones render; closed history transferred + sorted client-side every open.

**Exact files:**
- `supabase/migrations/0041_public_cluster_directory.sql:32-44` (`get_clusters_by_mode`), `0042`, `0043`
- `src/features/discovery.ts:28-40` (`useClustersByMode`), `src/pages/DiscoveryModePage.tsx:65-67`
- `src/features/signals.ts:10-68`, `src/features/votes.ts:13-54`
- `src/pages/cluster/RoomView.tsx:74-76,223-229,427-432`, `SignalsView.tsx:36-37,52-55`, `VotesView.tsx:40-41,76-80`, `ClusterRail.tsx:56-73`

**Proposed fix:**
1. Migration: `p_limit/p_offset` args on `get_clusters_by_mode`, `LEFT JOIN cluster_members GROUP BY` or cached `clusters.member_count` trigger (see `0037_cluster_member_counts.sql` pattern).
2. Frontend: `.eq('status','open').limit(100)` for room signals/votes + separate paginated history; virtualize directory list; `useMemo` for `memberById`/`replyCount` maps; hoist `useParams()` out of `SignalCard:257`; `memo()` cards.

**Indexes/migrations required:** directory ordering index, e.g. `(matching_mode, created_at DESC) WHERE status <> 'archived'` (confirm against `0041` predicate before adding).

**Functional impact:** directory pagination changes UX (needs "load more"); room history moves behind explicit affordance. Closed-vote counts must remain reachable.

**Risk:** **Low** (read path; mostly additive).

---

## S-14 — Render jank, timers, images/GIFs, geo (deferrable polish)

**Current problem:** unmemoized derives re-run per render; one `setInterval(60s)` per `CountdownTimer`; avatar/image signed-URL `refetchInterval` per item; GIF uploads up to 5MB rendered full-size; `GifPicker` fires per keystroke; `reverseGeocode` no cache/timeout; staff roles page mounts desktop+mobile DOM simultaneously.

**Exact files:**
- `src/components/ClusterRail.tsx:56-73`, `PostCard.tsx:20-42`, `CommentThread.tsx:131-490`, `CommentItem.tsx`, `CountdownTimer.tsx:5-10`, `Avatar.tsx:15`, `PostMedia.tsx:52-61`, `PostComposer.tsx:42-55`
- `src/pages/cluster/RoomView.tsx:422-435,652,716-829`, `SignalsView.tsx:51-55`, `VotesView.tsx:209`, `staff/ModerationQueuePage.tsx:87-94,284-362`, `ModerationAuditPage.tsx:322-347`, `ModerationRolesPage.tsx:159-325`, `AdminAppealCasePage.tsx:71,157-159`
- `src/features/avatars.ts:35-51`, `src/features/cluster.ts:369-376`, `src/features/posts.ts:636`, `src/features/gifs.ts:91-100`, `src/pages/cluster/room/GifPicker.tsx:20-23`
- `src/lib/geo.ts:71-101`, `src/lib/image.ts:20-24`, `src/app/providers.tsx:9-22`

**Proposed fix:**
- `memo()` cards/rows, `useMemo` maps, `useCallback` handlers; shared `useNow()` clock; raise feed `staleTime` 60–120s, `gcTime` 5–10m, `keepPreviousData` on paginated queries.
- Images: 1080px max (not 1600), thumb variant, `decoding="async"`, blur placeholder; GIFs: cap size/dims, webp preview, `srcset`; GifPicker: debounce 250–300ms, `enabled: query.length>2`, cap 12 + paginate.
- Geo: `AbortSignal.timeout(8000)`, `Map<roundedLatLng,Place>` cache.
- Staff: virtualize queues/audit/comments, media-query hook instead of dual DOM, cap CSV export off main thread.

**Indexes/migrations required:** none.

**Functional impact:** visual/perf only; virtualization changes scroll/DOM (needs a11y + e2e check). Signed-URL `refetchInterval` removal needs `visibilitychange` refresh fallback.

**Risk:** **Low** (isolated UI; verify per-component tests + Playwright).

---

## Recommended phased plan

### Phase 1 — Must fix before beta/launch (launch survival)

Order: **S-01 → S-02 → S-03 → S-04 → S-05 → S-07 → S-08 (permissive thresholds)**

Why: S-01/S-02/S-03 are thundering-herd paths that scale with users × tabs — the first traffic spike will find them. S-04 is a one-day low-risk win that cuts initial load for everyone. S-05/S-07 prevent cron/push pile-ups that page you at night. S-08 permissive limits stop scripted abuse without blocking legit users.

Gate: `supabase db reset` + `test:integration` (notifications, matching, governance, push, emails) + `test:e2e` notifications/cluster-room + `EXPLAIN` on rewritten RPCs + `npm run build` bundle check.

### Phase 2 — Should fix shortly after launch (as data grows)

Order: **S-09 → S-10 → S-06 → S-11 → S-12 → S-13**

Why: S-09 (`cluster_id` denorm) is the high-risk enabler — do it once early in Phase 2 with full reset + mobile sync, then S-10/S-06/S-11 stack on its indexes. S-12/S-13 are throughput/UX as outbox and directory fill up.

Gate: staged migration with batched backfill on production-sized snapshot, `supabase db lint --local`, RLS tests (`rls.test.ts`, `rbac.test.ts`, `safety.test.ts`), realtime restart check (`supabase stop && supabase start`), mobile `sync:db-types --check`.

### Phase 3 — Defer until real usage data (optimize with numbers)

**S-14 only.**

Why: memo/virtualization/image/geo polish needs Real User Monitoring (LCP/INP, bundle analyzer, Realtime inspector, `pg_stat_statements`) to target the actual hot screens. Do not prematurely virtualize every list — instrument first, then fix the slowest route.

Gate: RUM + `test:coverage` (do not lower thresholds in `vite.config.ts`) + Playwright `data-e2e` coverage for virtualized lists.

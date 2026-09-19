# Notifications: seen-vs-clear (single click keeps row, Mark all read empties) — Implementation Plan

Status: **implemented** on branch `feat/notifications-seen-vs-clear` (migration `0133`, web + mobile centers, unit/integration/E2E tests, `docs/TECHNICAL.md`). Verified: `npm run lint` (0 errors), `test:coverage` (710 passed), `test:integration` (241 passed), `test:e2e` (27 + 27 passed), plus a live-browser UI walkthrough.

## 1. Problem statement

Current flow (migration `0116_notifications_unread_only.sql`, frontend `src/pages/NotificationsPage.tsx:62-68`):

- `get_my_notifications()` returns **only** rows with `read_at IS NULL` (plus one synthesized unread `message` entry per cluster with unread chat).
- `NotificationsPage.handleClick` calls `useMarkNotificationRead` (`src/features/notifications.ts:102-122`, direct `UPDATE notifications SET read_at`) then navigates via `notificationTarget` (`src/features/notifications.ts:330-362`).
- Because the center is unread-only, marking one row read **removes that card** from `/notifications` on refetch.
- `Mark all read` calls `mark_all_read()` (`supabase/migrations/0049_message_reads.sql:88-114`: `UPDATE notifications SET read_at`, advance all `last_read_message_at` watermarks, freeze `message_reads`), which empties the whole page.

Requested flow (confirmed via Q&A):

1. Clicking a single notification navigates to the content and marks that notification **seen/read**, but the row **stays visible** (greyed, no unread dot). Badge/unread count decrements.
2. Only `Mark all read` **clears every row** from the page (empty state: "You're all caught up", no cards).

## 2. Why this needs a backend change (not frontend-only)

The two accepted answers are mutually inconsistent under the current single-boolean schema:

- If `get_my_notifications()` keeps returning only `read_at IS NULL` rows, a single-click read **must** disappear (current bug from the user's perspective). No frontend trick can keep it: any refetch/realtime invalidation drops it.
- If we simply return read + unread rows, a single click stays (good) but `mark_all_read` (currently `UPDATE ... SET read_at`) would leave **all rows visible as read history** — the page would never empty, contradicting requirement 2.

There is no flag today distinguishing "individually seen" from "bulk cleared". So we need one of:

- **(Chosen) Option A — read history + bulk delete.** `get_my_notifications()` returns recent read **and** unread stored rows; `mark_all_read()` **deletes** the caller's stored rows instead of marking them read (chat watermark behavior unchanged). Single `UPDATE read_at` keeps the row; bulk `DELETE` empties the page. No new column, no type change, minimal blast radius.
- Option B — new `archived_at`/`dismissed_at` column. More expressive (true inbox/archive semantics) but heavier: new column + index + RLS/policy review + new/changed RPCs + type regen (`src/lib/database.types.ts` + `mobile/src/lib/database.types.ts` via `mobile/scripts/sync-db-types.mjs`) + more tests. Rejected for now; can be a follow-up if product wants persistent history that survives "Mark all read".
- Option C — frontend-only optimistic keep. Rejected: refetch/realtime/poll (30s) would drop the row anyway; badge (`get_unread_notification_count`, derived from `get_my_notifications` per `0114`) would drift.

## 3. Scope and touchpoints

| Layer | Files | Change |
|---|---|---|
| DB migration (new) | `supabase/migrations/0133_notifications_seen_vs_clear.sql` (next number after `0132`) | Redefine `get_my_notifications()` (drop `read_at IS NULL` filter); redefine `mark_all_read()` (`DELETE` stored rows + keep chat watermark/`message_reads` logic) |
| Web center | `src/pages/NotificationsPage.tsx` | Enable `Mark all read` whenever rows exist (not only when `unread > 0`); keep `handleClick` mark-single-then-navigate; subtitle already handles "all caught up" with history visible |
| Mobile center | `mobile/app/(app)/notifications.tsx:67-76,93-96` | Same button-enable change; same `handleClick` (uses shared `mobile/src/features/notifications.ts`, a generated copy — do not hand-edit beyond mirroring web) |
| Shared hooks | `src/features/notifications.ts`, `mobile/src/features/notifications.ts` (synced copy) | No signature change needed; doc-comments updated to describe new semantics |
| Unit/component tests | `src/features/notifications.test.tsx`; new `src/pages/NotificationsPage.test.tsx` (does not exist yet) | Update/extend: single-read keeps row; mark-all empties |
| Integration tests | `tests/integration/notifications.test.ts:230-284` | Update `mark_all_read` test (delete semantics) and replace "marking one removes it" test with "marking one keeps it as read" |
| E2E | `e2e/notifications.spec.ts:80-109` | Single-click test asserts card **stays** without unread dot; bulk test asserts cards **gone** + empty state |
| Docs (source of truth) | `docs/TECHNICAL.md:207-209` | Rewrite "Unread-only center (0116)" bullet to "Seen-vs-clear center (0133)" |
| Types | `src/lib/database.types.ts`, `mobile/src/lib/database.types.ts` | **No change expected** (same RPC names, args, return shapes). Verify with `node mobile/scripts/sync-db-types.mjs --check` |

Out of scope: push pipeline (`supabase/functions/send-push`, `push_outbox`), staff badges (`mark_staff_notifications_read`, `report_new`/`appeal_new` exclusion stays), prefs (`notification_allowed` stays), realtime channel shape, design tokens.

## 4. Detailed backend design

### 4.1 `get_my_notifications()` — return read history

Base the new definition on `0116_notifications_unread_only.sql` (which itself builds on the `0115`/`0087`/`0054` lineage), changing **only** the stored-rows branch:

```sql
-- 0133_notifications_seen_vs_clear.sql (excerpt)
create or replace function public.get_my_notifications()
returns table (
  id uuid,
  type public.notification_type,
  cluster_id uuid,
  title text,
  body text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with unread_chat as (
    -- unchanged from 0116: one synthesized `message` entry per cluster
    -- with unread, approved, non-deleted, non-own messages past the watermark
    ...
  )
  select n.id, n.type, n.cluster_id, n.title, n.body, n.payload, n.read_at, n.created_at
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
    -- NOTE: no `and n.read_at is null` anymore: read rows stay visible
    and n.type not in ('report_new', 'appeal_new')
    and public.notification_allowed(p, n.type, n.cluster_id)

  union all

  select ... from unread_chat where unread_chat.rn = 1

  order by created_at desc
  limit 100;
$$;
```

Notes:

- Keep the staff-type exclusion (`report_new`, `appeal_new`) and the prefs gate (`notification_allowed`) byte-for-byte.
- Keep the synthesized chat branch **exactly** as in `0116` (chat entries always have `read_at NULL`; they exist only while unread).
- Keep `order by created_at desc limit 100`. Newest-first interleaves read/unread; styling (not ordering) distinguishes them. Do **not** reorder unread-first: it would churn positions on every read and complicate the "stay in place as read" expectation.
- `get_unread_notification_count()` (`0114`: `select count(*) from get_my_notifications() where read_at is null`) needs **no change** and stays in step with the badge by construction.

### 4.2 `mark_all_read()` — bulk clears stored rows

Base on `0049_message_reads.sql:88-114`, changing **only** the stored-notifications statement from `UPDATE` to `DELETE`:

```sql
create or replace function public.mark_all_read() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz;
begin
  v_now := now();

  -- unchanged: freeze message_reads for newly covered messages
  insert into public.message_reads (message_id, user_id, read_at)
  select m.id, cm.user_id, v_now
  from public.cluster_members cm
  join public.messages m on m.cluster_id = cm.cluster_id
  where cm.user_id = auth.uid()
    and cm.left_at is null
    and m.deleted_at is null
    and m.author_id <> cm.user_id
    and m.created_at > cm.last_read_message_at
    and m.created_at <= v_now
  on conflict (message_id, user_id) do nothing;

  -- CHANGED: bulk clear deletes the caller's stored rows (read and unread),
  -- so the center empties. Single reads stay because they only set read_at.
  delete from public.notifications
  where user_id = auth.uid();

  -- unchanged: advance all chat watermarks (clears synthesized chat entries)
  update public.cluster_members
  set last_read_message_at = v_now
  where user_id = auth.uid() and left_at is null;
end; $$;
```

Why `DELETE` and not `UPDATE ... SET read_at`:

- Satisfies "Mark all read empties the page" while single `UPDATE read_at` keeps the row. Any `UPDATE`-based bulk would leave read history visible.
- `mark_all_read` is `security definer`, so the `DELETE` bypasses RLS safely and only touches `user_id = auth.uid()` rows.
- No FK references `public.notifications(id)` (verified: grep for `references public.notifications` finds nothing), so delete is safe. Push delivery fans out from the `notifications` INSERT trigger into `push_outbox` at insert time; deleting after delivery does not retract pushes.
- Storage bonus: currently read rows accumulate hidden forever; bulk delete actually reclaims them.
- Grants unchanged: `grant execute on function public.mark_all_read() to authenticated` already exists; `create or replace` preserves it, but re-assert the grant in the migration for safety (pattern used by earlier migrations).

### 4.3 What single-click does (unchanged mutation, new visible effect)

- Stored event rows (mention, reaction, vote_*, signal_new, invitation_received, cluster_formed, queue_update, moderation_notice, post_comment, post_like, unlocked, replacement): `useMarkNotificationRead` (`src/features/notifications.ts:106-114`) does `UPDATE notifications SET read_at = now() WHERE id = ...` under RLS (own row). After migration the row **stays** in `get_my_notifications()` with `read_at` set → greyed card, no dot, badge decrements. Then navigates via `notificationTarget`.
- Synthesized chat (`message`) rows: there is **no stored row** to mark. `handleClick` navigates to `/cluster/:id`; opening the room calls `mark_cluster_read` (`src/pages/cluster/RoomView.tsx:83` + `mobile/app/(app)/cluster/[clusterId]/room.tsx:94`), which advances that cluster's watermark → that cluster's chat entry disappears. This is inherent to watermark-synthesized entries and is **kept as-is**: for chat, "going to the content" consumes the entry. Document this nuance in the empty-state/subtitle copy review (no copy change required now).

### 4.4 Realtime / polling / badge

- `useNotificationsChannel` (`src/features/notifications.ts:276-327`): INSERT invalidation already refreshes list + badge; **no change**. Single-read `UPDATE read_at` does not emit an INSERT event, but the mutation's own `invalidateQueries` (`src/features/notifications.ts:115-120`) refetches. No new realtime publication needed.
- Poll (`refetchInterval: 30_000` in `useMyNotifications`/`useUnreadCount`) unchanged.
- Badge (`get_unread_notification_count`) unchanged and correct: counts `read_at IS NULL` rows of the widened function + synthesized chat.

## 5. Frontend design

### 5.1 Web — `src/pages/NotificationsPage.tsx`

Current (`:60`, `:79-84`):

```tsx
const unread = items.filter((n) => n.read_at === null).length;
// ...
disabled={unread === 0 || markAll.isPending}
```

New:

```tsx
const unread = items.filter((n) => n.read_at === null).length;
// rows stay after single read; bulk clears everything including read history
disabled={items.length === 0 || markAll.isPending}
```

- `handleClick` (`:62-68`) unchanged: `if (n.read_at === null) markRead.mutate(n.id)` then `navigate(target.to)`. Fire-and-forget mutate is kept (navigation should not wait for the write).
- Subtitle (`:75-77`) unchanged: `unread > 0 ? '${unread} unread' : 'You’re all caught up'` — now the "caught up" line can appear **above visible read history**, which is the intended "seen" state.
- Empty state (`:100-106`, `items.length === 0`) unchanged: shown only when there is truly no history (fresh account or after `Mark all read`).
- Card styling (`:116-130`, `:142-144`) already distinguishes read vs unread; no change needed. Read cards keep `border-outline-variant/60 bg-surface` + no dot.
- Optional a11y nicety (not required): add `aria-label` distinguishing read/unread cards when writing the new page test. Keep visual tokens untouched per `docs/DESIGN.md` (no new colors/radii).

### 5.2 Mobile — `mobile/app/(app)/notifications.tsx`

Mirror change (`:68`, `:95`):

```tsx
disabled={unread === 0 || ...} → disabled={items.length === 0 || ...}
```

`handleClick` (`:70-76`, shared `mobileTarget` routing) unchanged. `NotificationRow` read styling (`:151-184`) already handles both states. Note `mobile/src/features/notifications.ts` is a synced copy of the web module — do not diverge logic; only the screen file changes, plus doc-comment sync if web comments change (via `mobile/scripts/sync-db-types.mjs` check, see §7).

## 6. Test plan

### 6.1 New migration lint + reset

- `supabase db lint --local` must pass for `0133`.
- `supabase db reset` rebuilds from scratch; then `npm run seed:demo` (writes `.env`, creates `diya@demo.example` / `sensor123` in cluster "Aurora").

### 6.2 Integration (`tests/integration/notifications.test.ts`, requires `supabase start`, sequential, 20s timeouts)

1. `mark_all_read clears event notifications and chat unread` (`:230-258`): still expects `listAfter` length 0 — passes under delete semantics. Extend with an explicit assertion that the `notifications` table holds **zero** rows for the user after bulk (locks in delete-vs-update), e.g. `admin.from('notifications').select('id').eq('user_id', b.id)` → `[]`.
2. Replace `marking one notification read removes it from the unread-only center` (`:260-284`): rename/rewrite to `marking one notification read keeps it as read history`. New assertions:
   - `before`: mention row present with `read_at === null`.
   - Direct `UPDATE notifications SET read_at` (same as today, RLS own row) succeeds.
   - `after`: row **still present** with `read_at !== null`; `get_unread_notification_count` decremented (badge no longer counts it); synthesized chat entry for the same cluster (if any) unaffected.
3. Add (or extend) a mixed test: seed two stored events, mark one read, assert center returns 2 rows (1 unread + 1 read), `get_unread_notification_count` is 1; then `mark_all_read`, assert center returns 0 rows and count is 0.
4. Keep all other tests (`returns only caller notifications`, chat surfacing, prefs gating, reaction fan-out, RLS) unchanged — they use all-unread fixtures so widened reads don't affect them. The `badge matches the center rows` test (`:160-180`) should keep passing; optionally assert `list` length equals unread length when nothing is read yet.

### 6.3 Unit/component (Vitest jsdom, colocated)

- `src/features/notifications.test.tsx`: existing hook tests (`useMarkNotificationRead` UPDATE + invalidations, `useMarkAllNotificationsRead` → `mark_all_read` RPC) remain valid; update the test **names/comments** that say "removes/clears" for single-read to say "marks read (row stays; center now returns history)". No mock shape change.
- `src/pages/NotificationsPage.test.tsx` (mocks `useMyNotifications`/`useMarkAllNotificationsRead`/`useMarkNotificationRead` + `react-router` navigate):
  - Renders unread + read rows; clicking an unread row calls `markRead.mutate(id)` and navigates; clicking a read row only navigates.
  - `Mark all read` enabled when rows exist even if `unread === 0`; disabled when `items.length === 0`; disabled while pending.
  - Subtitle shows `N unread` vs `You're all caught up` (with history still listed).
- Coverage gate (`npm run test:coverage`, v8 thresholds lines 34% / functions 33% / branches 20% in `vite.config.ts`): must not regress — **never lower thresholds**.

### 6.4 E2E (Playwright `e2e/`, requires `supabase start` + `seed:demo` + chromium)

- `renders a seeded unread notification and marks it read on click` (`e2e/notifications.spec.ts:80-95`): update — after `card.click()`, assert unread dot count is 0 **and the card is still visible** (now rendered in read style), subtitle `all caught up` visible. The seeded row has no `cluster_id`, so no navigation occurs (existing comment `:91` stays true).
- `marks all seeded notifications read via the bulk action` (`:97-109`): update — after bulk click, assert dot count 0 **and cards gone** (`card` count 0) + `all caught up` + button disabled (now because list is empty).
- Add a mixed-state case: seed one read + one unread row (via the existing `readAt` override in `seedNotification`), assert both render, exactly one dot, and the `1 unread` subtitle.

### 6.5 Manual QA script

1. As `diya@demo.example`, trigger two notifications (e.g. mention + reaction, or seed via service role).
2. Open `/notifications`: expect `2 unread`, two dots.
3. Click card 1 → lands on target content; back to `/notifications`: card 1 greyed without dot, card 2 still highlighted; subtitle `1 unread`; badge decremented by 1.
4. Reload page: same state persists (proves backend, not just optimistic UI).
5. Click `Mark all read` → page empties to "You're all caught up" + disabled button; badge 0.
6. Repeat on mobile app (`mobile/app/(app)/notifications.tsx`): same transitions; pull-to-refresh reflects state.
7. Chat check: send a plain message in another cluster → synthesized `message` entry appears; tap it → room opens and entry clears (watermark consumed — expected exception to "stay as read", document in PR description).

## 7. Docs, types, and mobile sync

- `docs/TECHNICAL.md:193-209` (migration timeline + "Unread-only center (0116)" bullet): append a `0133` entry — "Seen-vs-clear center: `get_my_notifications` returns recent read + unread stored rows (chat entries stay unread-only synthesized); single read keeps the row greyed; `mark_all_read` deletes stored rows and advances chat watermarks so the center empties. Badge still derives from the same function (`0114`), counting `read_at IS NULL`."
- `docs/ARCHITECTURE.md` / `docs/PRD.md` (`/notifications` line ~1495, notification-center line ~499): leave untouched. Neither states "read items disappear on click", so no change needed there (README/CONTRIBUTING point to `docs/`; CI skips docs-only changes via `paths-ignore`).
- Types: RPC names/args/returns unchanged → `src/lib/database.types.ts` regen not strictly needed; confirm by diffing `supabase db diff` output or running the project's codegen if present. Then `node mobile/scripts/sync-db-types.mjs --check` must pass; commit regenerated mobile copies only if the script reports drift (per AGENTS.md pre-push rule for synced web files).

## 8. Rollout / migration safety

- Additive-only pattern per repo rules (**never edit an applied migration**): everything lives in new `0133_*.sql` as `create or replace`.
- Remote DBs migrate only on merge (staging on PR→`develop`, prod on `develop`→`main`); feature branches never apply remotely.
- Data impact: existing hidden read rows (previously invisible) become visible history (up to 100 newest) after deploy. This is intended, but call it out in the PR: users with long unread-only histories will suddenly see greyed history. No backfill needed; no data loss except on future bulk clears (by design).
- Realtime: after changing a realtime-adjacent migration, run `supabase stop && supabase start` locally or realtime won't pick up the change (per AGENTS.md).
- Rollback: re-apply the `0116` function definition to restore unread-only + `UPDATE`-based `mark_all_read`. Note rollback resurrects nothing bulk-deleted after deploy (accepted: user explicitly wants bulk to clear).

## 9. Pre-push verification checklist (per AGENTS.md)

1. `npm run lint` (oxlint, fix by hand, no autofix script).
2. `npm run test:coverage` (hard v8 gate — do not lower).
3. `npm run build` (`tsc -b` + `vite build`; type errors fail).
4. Migrations changed → `supabase db reset` + `npm run test:integration`.
5. Synced web file changed → `node mobile/scripts/sync-db-types.mjs --check` (+ commit regenerated copies if drift).
6. E2E touched → `npm run seed:demo` + `npx playwright install chromium` (once) + `npm run test:e2e`.
7. `supabase db lint --local`.
8. Git: branch from `develop` (`feat/notifications-seen-vs-clear`), squash-merge PR into `develop` (never branch from / PR into `main`; releases `develop`→`main` use merge commits + `npm run check:release`).

## 10. Decisions (locked)

1. Chat entries clear on room open — accepted as the documented exception. Synthesized `message` rows have no stored row to keep; opening the room advances the watermark and consumes the entry. Stored event rows are the ones that stay as read history.
2. Ordering stays newest-first (`order by created_at desc`), read and unread interleaved. Unread-first re-sorting would churn card positions on every read and fight the "stays in place as read" expectation.
3. `limit 100` stays. It already bounds the widest query; raising it grows payload for no product need. True pagination/virtualization is a separate follow-up (see `docs/archive/MOBILE_UX_IMPLEMENTATION_PLAN.md`).
4. Bulk uses `DELETE`, not an archive column. No FK references `notifications.id`, push fan-out happens at insert time into `push_outbox`, and the requirement is literally "empty state". An `archived_at` column is deferred until product asks for history that survives "Mark all read".

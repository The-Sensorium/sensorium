# Staff Notifications — Implementation Plan

Status: **implemented** (migrations 0086/0087/0088; verified: `npm run lint`, `npm run build`, unit coverage gate, `supabase db reset`, `supabase db lint --local`, `npm run test:integration`)
Scope: give moderators/admins unread indicators on their moderation tab(s) (Reports, Appeals), mirroring the member notification-center experience, wired end to end (database → realtime → badge UI).

## 1. Problem

Member-facing notifications work today: `AppShell` renders a `NotificationBell` (badge via `get_unread_notification_count`) and a `/notifications` center, fed by realtime `INSERT` on the `notifications` table.

The staff shells have **nothing**:

- `ModeratorLayout.tsx` (Reports) and `AdminLayout.tsx` (Reports / Appeals / Roles / Audit) render `StaffNavigation` / `StaffMobileNav` as plain `NavLink`s — no badge, no count (StaffNavigation.tsx:20, :37).
- No `/notifications` route exists under either staff shell (router.tsx:151–187).
- No `report_new` / `appeal_new` `notification_type` exists, and no database code emits a notification when a report or appeal is created. All `moderation_notice` rows are addressed to the *reported* member, never to staff.

So a moderator/admin sees no unread indicator and no realtime cue when a report or appeal lands.

## 2. Design decision

Two viable designs. **Locked: per-user notification rows** (true unread semantics, reuses existing infra), confirmed with the product owner on Aug 2026.

The following are settled (no further decisions needed):

- **Badge = unread inbox** (not a work-queue count). New report/appeal → +1 for each eligible staff member; clears per-user when that moderator opens the tab.
- **Staff events are excluded from the shared member read path** (`get_my_notifications` / `get_unread_notification_count`) so staff who also browse as members don't see moderation noise in their member `/notifications`.
- **Badges on tabs only** — no staff notifications list page or route.
- **Staff never self-notify on their own report/appeal**; `get_staff_unread_counts` returns one `{reports, appeals}` row (single frontend hook).

| Decision | Recommend | Why |
|---|---|---|
| Emit a `notifications` row per eligible staff user on report/appeal submit | ✅ | Reuses `notifications` table, RLS `self`, realtime `INSERT` channel (`useNotificationsChannel` already mounted in both staff shells). Badge is a real per-user unread count. Small fan-out is fine for a small staff. |
| Derive the count live from `reports`/`appeals` status | Options | No fan-out, but "unread" is not per-user (shared queue), needs realtime publication on two more tables + a second channel subscription. Less faithful to "notifications like regular users". |

The rest of this plan assumes the **locked** approach.

### New event types

Add `report_new` and `appeal_new` to `public.notification_type`.

- `report_new` → notifies every active **moderator + admin** (whole report queue sees it).
- `appeal_new` → notifies every active **admin** only (appeals are `can_manage_roles`-gated, i.e. admin-only).

### "Read" semantics

Each staff member has their own row, so their own badge clears when *they* open the relevant tab. Opening the Reports list marks the caller's `report_new` rows read; opening Appeals marks `appeal_new` read. This is the same "opening the inbox clears it" behaviour as the member center. New arrivals re-insert and re-arm the badge.

## 3. Architecture

```
Member submits report / appeal
  └─ security-definer RPC inserts into public.reports / public.appeals
        └─ AFTER INSERT trigger fans out a notifications row per eligible staff user
              ├─ user_roles (revoked_at IS NULL) ∩ account is active
              ├─ role: report_new → admin+moderator | appeal_new → admin only
              └─ notifications (user_id = staff, type, cluster_id?, title, body, payload{*_id})
                     │
       Postgres Changes (notifications is already in supabase_realtime)
                     ▼
       useNotificationsChannel (already mounted in both staff shells)
                     └─ invalidates ['staff','unread'] query key
                            │
                            ▼
       StaffNavigation / StaffMobileNav → <UnreadBadge count> per tab via useStaffUnreadCounts()
```

After visiting a tab, the page calls `mark_staff_notifications_read('report_new' | 'appeal_new')`, which clears the caller's badge.

## 4. Migrations

Per the strict rule **never edit an applied migration** — add new ones. Because Postgres forbids using a freshly added enum value in the same transaction as the `ALTER TYPE ... ADD VALUE` (see 0055 precedent), the enum additions land in their **own** migration and the functions/trigger that reference them in the next.

### Migration A — `supabase/migrations/0086_staff_notification_types.sql`

```sql
alter type public.notification_type add value 'report_new';
alter type public.notification_type add value 'appeal_new';
```

Registering the enum values alone does not need realtime. After this migration, confirm `database.types.ts` is regenerated/updated (see §7).

### Migration B — `supabase/migrations/0087_staff_notifications.sql`

Shareable fan-out helper (security definer so RLS does not block inserts; `is_account_active` is already security definer):

```sql
create or replace function public.notify_staff(
  p_type public.notification_type,
  p_cluster_id uuid,
  p_title text,
  p_body text,
  p_payload jsonb default null,
  p_admin_only boolean default false,
  p_exclude_user_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select distinct r.user_id, p_type, p_cluster_id, p_title, p_body, p_payload
  from public.user_roles r
  where r.revoked_at is null
    and r.user_id is not null
    and r.role = any (case when p_admin_only then array['admin'] else array['admin','moderator'] end)
    and public.is_account_active(r.user_id)
    and r.user_id is distinct from p_exclude_user_id;
end; $$;
```

AFTER INSERT triggers (single insertion point — catches `report_member`, `report_post`, `report_post_comment`, and `submit_appeal` without re-defining those functions):

```sql
create or replace function public.trigger_report_staff_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    perform public.notify_staff(
      'report_new', new.cluster_id,
      'New report: ' || replace(new.reason::text, '_', ' '),
      (select display_name from public.profiles where id = new.target_user_id),
      jsonb_build_object('report_id', new.id, 'reason', new.reason::text, 'target_user_id', new.target_user_id),
      false,
      new.reporter_id
    );
  end if;
  return new;
end; $$;

create trigger reports_staff_notify
  after insert on public.reports
  for each row execute function public.trigger_report_staff_notify();

create or replace function public.trigger_appeal_staff_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_staff(
    'appeal_new', null,
    'New appeal',
    (select display_name from public.profiles where id = new.user_id) || ' has appealed a decision',
    jsonb_build_object('appeal_id', new.id),
    true,
    new.user_id
  );
  return new;
end; $$;

create trigger appeals_staff_notify
  after insert on public.appeals
  for each row execute function public.trigger_appeal_staff_notify();
```

Note: duplicate-report guards `raise` **before** the insert, so a rejected duplicate never fires the trigger, and `p_exclude_user_id` means a staff member never self-notifies on their own submission (locked).

#### Member read-path exclusion

Because staff events are a different concern from member cluster activity, the two shared read functions are re-defined (per rules, never edit the applied migrations — this is a `create or replace` in the new migration, the established additive pattern) to drop staff-type rows from the member notification center:

```sql
create or replace function public.get_my_notifications()
returns table (
  id uuid, type public.notification_type, cluster_id uuid, title text, body text,
  payload jsonb, read_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with unread_chat as ( /* ... unchanged from 0054 ... */ )
  select n.id, n.type, n.cluster_id, n.title, n.body, n.payload, n.read_at, n.created_at
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
    and n.type not in ('report_new', 'appeal_new')                 -- NEW: exclude staff events
    and public.notification_allowed(p, n.type, n.cluster_id)
  union all
  /* ... unread_chat select unchanged ... */
  order by created_at desc
  limit 100;
$$;

create or replace function public.get_unread_notification_count()
returns bigint
language sql stable security definer set search_path = public as $$
  select (
    (select count(*)
     from public.notifications n
     left join public.notification_prefs p
       on p.user_id = n.user_id and p.cluster_id = n.cluster_id
     where n.user_id = auth.uid()
       and n.read_at is null
       and n.type not in ('report_new', 'appeal_new')               -- NEW
       and public.notification_allowed(p, n.type, n.cluster_id))
    + /* ... unread chat count unchanged ... */
  )::bigint;
$$;
```

(The bodies must match the current 0054 / 0038 definitions exactly, aside from the two added `type not in (...)` predicates.)

Unread count RPC (staff-scoped; returns 0 for non-staff via the role gates):

```sql
create or replace function public.get_staff_unread_counts()
returns table (reports bigint, appeals bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_moderate(auth.uid()) then return query select 0::bigint, 0::bigint; return; end if;
  return query
  select
    (select count(*) from public.notifications n
      where n.user_id = auth.uid() and n.type = 'report_new' and n.read_at is null),
    case when public.can_manage_roles(auth.uid())
         then (select count(*) from public.notifications n
                where n.user_id = auth.uid() and n.type = 'appeal_new' and n.read_at is null)
         else 0::bigint end;
end; $$;
```

Mark-read RPC:

```sql
create or replace function public.mark_staff_notifications_read(p_type public.notification_type)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_type not in ('report_new', 'appeal_new') then raise exception 'invalid_notification_type'; end if;
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and type = p_type and read_at is null;
end; $$;
```

Grants:

```sql
grant execute on function
  public.get_staff_unread_counts(),
  public.mark_staff_notifications_read(public.notification_type)
  to authenticated;
```

Realtime: the `notifications` table is already in `supabase_realtime`, so staff INSERT events already stream through the existing `useNotificationsChannel` subscription in both shells — **no publication change needed**.

### Migration B ordering / local stack notes

Database lint: `supabase db lint --local`. Because realtime behaviour is unchanged, no `supabase stop && start` is required for the enum/trigger work (that note only applies to adding *new* tables to realtime).

## 5. Frontend changes

### `src/features/notifications.ts`

Add RPC wrappers alongside the existing member ones:

```ts
export function useStaffUnreadCounts(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  return useQuery({
    queryKey: ['staff', 'unread', userId ?? 'signed-out'],
    enabled: enabled && userId !== null,
    // No polling: a 30s read per staff member over 50 staff is ~4.3M requests a
    // month, a large share of a free-tier budget. Realtime INSERT invalidation
    // keeps the badge live; refetch-on-focus/reconnect covers coming back.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.rpc('get_staff_unread_counts')
      if (error) throw error
      return data as { reports: number; appeals: number }
    },
  })
}

export function useMarkStaffNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (type: 'report_new' | 'appeal_new') => {
      const supabase = requireSupabase()
      const { error } = await supabase.rpc('mark_staff_notifications_read', { p_type: type })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff', 'unread'] })
    },
  })
}
```

Extend `useNotificationsChannel` (notifications.ts:206) so a notification INSERT also refreshes the staff badge:

```ts
void queryClient.invalidateQueries({ queryKey: ['notifications', userId] })
void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
void queryClient.invalidateQueries({ queryKey: ['staff', 'unread'] })   // new
```

(Cheap and harmless for members; only fires on notification inserts.)

### `src/components/UnreadBadge.tsx` (new)

Extract the badge from `NotificationBell.tsx:7` (`Badge`) into a shared presentational component so both the staff nav and the bell use identical styling (caps at `99+`, `bg-error`). `NotificationBell` keeps using it.

### `src/components/StaffNavigation.tsx`

- Extend `StaffNavItem` with an optional `unreadKey?: 'reports' | 'appeals'`.
- Call `useStaffUnreadCounts()` once in `StaffNavigation` and in `StaffMobileNav`.
- Render `<UnreadBadge>` on an item's icon when `unreadKey` maps to a count > 0 (absolute-positioned top-right, mirroring the bell for the mobile variant).

### `src/app/layouts/ModeratorLayout.tsx`

```ts
{ to: '/moderator/reports', label: 'Reports', icon: Flag, unreadKey: 'report_new' }
```

### `src/app/layouts/AdminLayout.tsx`

```ts
{ to: '/admin/reports',  label: 'Reports', icon: Flag, unreadKey: 'report_new' },
{ to: '/admin/appeals',  label: 'Appeals', icon: MessageSquareWarning, unreadKey: 'appeal_new' },
// Roles, Audit: no badge
```

`unreadKey` carries the staff `notification_type`; `StaffNavigation` maps `report_new`→`reports` and `appeal_new`→`appeals` on the `get_staff_unread_counts` row.

### `src/pages/staff/ModerationQueuePage.tsx` and `src/pages/staff/AdminAppealsPage.tsx`

Both tabs behave **identically**, and both are **newest-first by default** with an Oldest/Newest toggle (migration 0089 adds `p_order` to both queue readers). The badge clears **once** when the moderator opens the tab (acknowledging the queue), then re-arms and persists on new arrivals until the tab is opened again.

Auto-clearing *every* arrival would be unsafe when a tab shows the **oldest** items first (paginated) — a brand-new row would land on a later, unseen page and clearing its badge would silently hide it. So the badge is cleared on tab-open only, never on arrival, for both tabs. Use the stable `mutate` (destructured) with a ref gate — React Query v5's mutation result object is not referentially stable, so depending on it would re-fire and loop `mutate` → `invalidateQueries` → rerender:

**Badge semantics:** the badge counts *events a given staff member hasn't acknowledged* (`report_new`/`appeal_new` with `read_at IS NULL` for that user), not a live count of open/pending items. So the Reports/Appeals status filter is not reflected in the count, and resolving a case does not decrement another moderator's badge until they open the tab. The per-user clear runs as a best-effort background `mutate`; if it fails (e.g. role revoked mid-session) the error is swallowed and the badge stays lit until the next tab open (the ref resets on remount, so it retries then) — acceptable for a background acknowledgement.

**Live list refresh:** because both tabs are newest-first by default, a newly arrived report/appeal is at the top of the first page, so the pages also watch the unread count and `refetch()` the queue when it increases while on screen — the new row appears immediately, no manual reload. The refetch is gated to the newest-first sort (in oldest-first a new row lands at the end, so refetching would show nothing), and to the per-user badge events. Both queue readers normalize `p_order` to `asc`/`desc`. (A single refetch per arrival while the tab is open; low moderation volume keeps this cheap.)

```ts
const { mutate: markReportRead } = useMarkStaffNotificationsRead()  // 'appeal_new' on the Appeals tab
const markedReadRef = useRef(false)
useEffect(() => {
  if (queue.isSuccess && !markedReadRef.current) {
    markedReadRef.current = true
    markReportRead('report_new')  // or 'appeal_new'
  }
}, [queue.isSuccess, markReportRead])
```

## 6. Type-sync

`src/lib/database.types.ts` is generated and must be kept in sync by hand (no codegen script).

- Add `'report_new'` and `'appeal_new'` to the `notification_type` enum (`Database['public']['Enums']['notification_type']`).
- Add function entries under `Database['public']['Functions']`:
  - `get_staff_unread_counts: { Args: never; Returns: { reports: number; appeals: number } }`
  - `mark_staff_notifications_read: { Args: { p_type: ... }; Returns: undefined }`

## 7. Tests

- **Unit** — `src/features/notifications.test.tsx`: mock the Supabase client; assert `useStaffUnreadCounts` calls `get_staff_unread_counts` and `useMarkStaffNotificationsRead` calls `mark_staff_notifications_read` with the right arg; assert the channel handler invalidates `['staff','unread']`. ✅ implemented.
- **Integration** — `tests/integration/staff-notifications.test.ts`: fan-out to moderators+admins / admins-only, self-notification exclusion, `get_staff_unread_counts` per role + 0 for members, `mark_staff_notifications_read` caller-only clearing, the role-guard denial, and the member read-path exclusion. ✅ implemented (7 tests).
- **StaffNavigation badge unit test** — not written (the component is render-only and exercised indirectly); optional follow-up.
- **E2E** (optional, not done) — seed a report, load `/admin/reports`, assert the badge appears then disappears after visiting.

## 8. Verification checklist

- `npm run lint`
- `npm run test:coverage` (must not regress the v8 gates in `vite.config.ts`)
- `npm run build` (typecheck)
- `supabase db lint --local`
- `supabase db reset` + `npm run test:integration`
- Manual: as a moderator, submit a report from a seeded member account and confirm the Reports badge appears in realtime; as an admin, submit an appeal and confirm the Appeals badge. Confirm a member account sees neither badge.

## 9. Risks / open questions

- **Fan-out size** scales with staff count (events × staff = inserts; read path is per-user indexed). Non-issue here: staff is bounded to ≤ 50 members, where a 1,000-report/day worst case is ~50k rows/day and the badge `count` query is per-user indexed. The fan-out would only start to matter at hundreds of staff × thousands of events/day. Each moderator clears their own badge independently (confirmed — "unread inbox" semantics, not a shared work-queue count).
- **Member center is clean** (locked): staff-type rows are excluded from `get_my_notifications` / `get_unread_notification_count`, so staff who also browse as members see no moderation noise.
- **No self-notification** (locked): staff never get a badge for their own report/appeal via `p_exclude_user_id`.
- **`get_staff_unread_counts`** returns one `{reports, appeals}` row (locked); split later only if the UI ever needs per-tab refresh granularity.
- **`mark_staff_notifications_read` is role-guarded** (0088): `report_new` requires `can_moderate`, `appeal_new` requires `can_manage_roles`. The `invalid_notification_type` branch is unreachable via the public RPC (PostgREST rejects a non-enum value before the body runs), so it is only belt-and-suspenders.

## 10. Files touched

| Path | Change |
|---|---|
| `supabase/migrations/0086_staff_notification_types.sql` | add enum values |
| `supabase/migrations/0087_staff_notifications.sql` | `notify_staff`, 2 triggers, count + mark-read RPCs, grants |
| `supabase/migrations/0088_staff_mark_read_role_guard.sql` | role-guard `mark_staff_notifications_read` (reports ⇒ can_moderate, appeals ⇒ can_manage_roles) |
| `supabase/migrations/0089_queue_order.sql` | `p_order` ('asc'/'desc') on `get_moderation_queue` + `list_appeals_page` (both default 'desc'); Oldest/Newest toggle on both staff tabs |
| `src/lib/database.types.ts` | enum + function types |
| `src/features/notifications.ts` | 2 hooks + channel invalidation |
| `src/features/admin-moderation.ts` | `useModerationQueue` takes an `order` (default 'desc') |
| `src/features/appeals.ts` | `useAdminAppeals` takes an `order` (default 'desc') |
| `src/pages/staff/ModerationQueuePage.tsx` | Oldest/Newest toggle + order-aware labels |
| `src/pages/staff/AdminAppealsPage.tsx` | Oldest/Newest toggle + order-aware labels |
| `src/components/UnreadBadge.tsx` | new, extracted badge |
| `src/components/NotificationBell.tsx` | use extracted badge |
| `src/components/StaffNavigation.tsx` | `unreadKey` + badge rendering |
| `src/app/layouts/ModeratorLayout.tsx` | `unreadKey: 'reports'` |
| `src/app/layouts/AdminLayout.tsx` | `unreadKey` on Reports/Appeals |
| `src/pages/staff/ModerationQueuePage.tsx` | mark `report_new` read |
| `src/pages/staff/AdminAppealsPage.tsx` | mark `appeal_new` read |
| `src/features/notifications.test.tsx` | new-hook coverage |
| `tests/integration/staff-notifications.test.ts` | new integration coverage |

## 11. Verification summary

- `npm run lint` — 0 warnings / 0 errors
- `npm run build` — typechecks + builds clean
- `npm run test:coverage` — unit gate passes (500 tests; All files 55.66% stmts / 58.52% lines; walls 34/33/20)
- `supabase db reset` — migrations 0086/0087/0088/0089 apply in order, no errors
- `supabase db lint --local` — only pre-existing warnings (0013 source_candidates, vote_responses), none from the new migrations
- `npm run test:integration` — 166 tests pass (14 files), incl. the 8 staff-notification tests (fan-out, self-notify exclusion, role-scoped counts, caller-only clearing, guard, member-path exclusion, sort direction)

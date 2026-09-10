# Mute + My Reports — Implementation Plan

Personal safety for beta (hundreds of users) without changing the 8-member
governance model. **Mute** hides someone's content for you only. **My Reports**
shows a reporter the status of their own reports. Neither removes members,
blocks DMs (there are none), nor changes votes, replacement, or moderation.

Default product decisions are locked (see §1).
Read order: [`PRD.md`](../PRD.md) → [`ARCHITECTURE.md`](../ARCHITECTURE.md) →
[`TECHNICAL.md`](../TECHNICAL.md) → this plan → [`DESIGN.md`](../DESIGN.md).

> **Status — implemented** (migrations `0090`–`0093`; `useMyMutes` / `useMuteUser`
> / `useMyReports` in `src/features/moderation.ts`, `MuteButton`, the Settings mute
> list, and the "My Reports" settings page). This doc is retained as the design
> record; see [`../TECHNICAL.md`](../TECHNICAL.md) and `PRD.md` for live behavior.

---

## 1. Scope & decisions (locked)

| Question | Decision |
|---|---|
| **Mute vs block** | **Mute only.** "Mute" hides content for the muter. Membership, history, votes, presence counts, and moderation are unchanged. No "block" that removes or hides you from them. |
| **Mute scope** | **Global per user** (`user_mutes(user_id, muted_user_id)`), not per cluster. One toggle covers every shared cluster. Rationale: clusters are max 8, shared history must stay coherent, per-cluster mutes multiply UI states for no beta gain. |
| **What mute hides** | Chat messages, posts, post comments/replies, signals + signal replies authored by muted users. Reactions by/on muted users stay (counts only, no content). Presence avatars stay (needed for member counts). |
| **How hidden content renders** | **Collapsed, not vanished:** a single-line placeholder ("Muted message from X — Show") with an inline Show toggle. Avoids confusing timeline gaps and lets the user override once. A muted top-level comment collapses alone; the thread's other replies stay visible. |
| **Who can be muted** | Any other user. Cannot mute self. No limit for beta. Muting a moderator/admin changes nothing about their actions against you. |
| **Mute enforcement point** | **Client-side filter only.** No RLS change, no RPC gating. The DB still returns the rows; the hook filters before render. A muted user is never told. |
| **My Reports content** | Reporter's own rows only: target name, target type (member / message / post / comment), cluster name, reason, the reporter's own submitted details, status (`pending`/`reviewing`/`actioned`/`dismissed`), created date, generic outcome. **Never:** staff identity, internal notes, enforcement detail (mirrors the email rule in `PRD.md`). |
| **My Reports route** | `/settings/reports` under `AppShell`, linked from a new **Safety** section in `/settings`. No new top-level nav item. Deep-linkable from `ReportModal` success and report emails (future). |
| **Out of scope** | Per-cluster mutes, mute expiry, muted-user list visibility to others, reporter→moderator messaging, appeal-from-report, admin view of mutes, push/email on mute. |

> **Product note.** PRD §Blocking says blocking is not supported and lists
> report/leave/vote as the recourse; the open question under Replacement Votes
> asks whether to add block/mute. This plan answers it with the smallest safe
> step: personal mute + reporter transparency, leaving vote/removal untouched.

---

## 2. Product behavior contract

### 2.1 Mute

- Entry points: `MembersView` card menu (Mute/Unmute), `ProfilePage`
  (`/profile/:userId?cluster=`) button, Safety section list (Unmute).
- Action is immediate + optimistic with undo toast-equivalent (inline error,
  no toast system in app). Muting never triggers a notification, email, or
  audit row.
- Muted content in `RoomView` timeline, `PostsFeedPage`/`PostDetailPage`,
  `CommentThread`, `SignalsView`/`SignalDetailPage` renders the collapsed
  placeholder. `Show` expands that one item for the session (local state,
  not persisted).
- `MessageItem` reply quotes of muted authors follow the same collapse rule.
- Unmute restores instantly (query invalidation, no reload).
- Edge: mute + report are independent; reporting does not auto-mute and
  muting does not file a report. `ReportModal` success offers a secondary
  "Also mute X" button when the target is a member/message author.

### 2.2 My Reports

- List newest first via `get_my_reports_v2()` (see §3.5). Each row: cluster
  name, reason label, target kind, status pill, relative date, generic outcome
  line when closed ("Reviewed — no action taken" / "Reviewed — action taken").
- Statuses map 1:1 to `report_status`: `pending` (open, unclaimed),
  `reviewing` (claimed), `actioned` / `dismissed` (closed). No staff names,
  no reason text beyond the reporter's own submitted reason/details.
- Empty state: "No reports yet. Reports you submit appear here."
- `ReportModal` success state gains a "View my reports" link to
  `/settings/reports`.

---

## 3. Database

All schema is **new ordered migrations** starting at `0090` (after `0089`).
Never edit an applied migration.

| File | Contents |
|---|---|
| `0090_user_mutes.sql` | `user_mutes` table + indexes + RLS + grants. |
| `0091_my_reports_v2.sql` | `get_my_reports_v2()` replacing the `0053` shape + grants. |
| `0092_my_reports_details.sql` | Drops + recreates `get_my_reports_v2()` (return-type change) adding `target_display_name` + the reporter's own `details` + grants. |
| `0093_my_mutes_with_profiles.sql` | `get_my_mutes()` returning the viewer's mute list with `display_name` + `avatar_url` for the Safety section + grants. |

### 3.1 Tables

```sql
create table public.user_mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id),
  constraint user_mutes_no_self check (user_id <> muted_user_id)
);

create index user_mutes_user_idx on public.user_mutes (user_id);
```

Notes:
- No cluster column (global mute, §1). Cascade on profile delete so account
  deletion (`delete_my_account`) cleans both directions.
- No `updated_at`; insert/delete is the toggle. No expiry column for beta.

### 3.2 RLS policies (in `0090`)

```sql
alter table public.user_mutes enable row level security;

create policy "mutes own read"
  on public.user_mutes for select
  using (auth.uid() = user_id);

create policy "mutes own insert"
  on public.user_mutes for insert
  with check (
    auth.uid() = user_id
    and public.is_account_active(auth.uid())
  );

create policy "mutes own delete"
  on public.user_mutes for delete
  using (auth.uid() = user_id);
```

Direct insert/delete from the client is permitted by these policies, so no
RPC is needed for the toggle (allowed by AGENTS.md: RLS-permitted writes).
Follow the `drop policy if exists` convention only if re-running; names are
new so plain `create policy` is fine on a fresh `supabase db reset`.

### 3.3 Grants (in `0090`)

```sql
grant select, insert, delete on public.user_mutes to authenticated;
```

No `update` grant (no mutable columns). No `service_role` grant needed beyond
the default table ownership; the table is never touched server-side.

### 3.4 `get_my_reports` problem

`0053.get_my_reports()` returns
`(id, cluster_id, target_user_id, reason, details, status, created_at)` only:
no `message_id`/`post_id`/`comment_id`, no cluster name, no closed-outcome
distinction beyond `status`. Post/comment reporting (`0073`) added columns it
cannot see. The frontend must not use it directly.

### 3.5 RPC — `get_my_reports_v2` (in `0091`)

```sql
create function public.get_my_reports_v2()
returns table (
  id uuid,
  cluster_id uuid,
  cluster_name text,
  target_kind text,
  reason public.report_reason,
  status public.report_status,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    r.id,
    r.cluster_id,
    c.name,
    case
      when r.comment_id is not null then 'comment'
      when r.post_id is not null then 'post'
      when r.message_id is not null then 'message'
      else 'member'
    end,
    r.reason,
    r.status,
    r.created_at
  from public.reports r
  join public.clusters c on c.id = r.cluster_id
  where r.reporter_id = auth.uid()
  order by r.created_at desc;
$$;

grant execute on function public.get_my_reports_v2() to authenticated;
grant execute on function public.get_my_reports_v2() to service_role;
```

Deliberately excludes `details` beyond the reporter's own (kept out so the
list stays scannable; details remain in the reporter's email receipt),
`assigned_to`, notes, and action detail. Generic outcome text is rendered
client-side from `status` alone.

---

## 4. Storage

None. No new buckets, no policy changes.

---

## 5. Frontend

### 5.1 Feature module — extend `src/features/moderation.ts`

```ts
export function useMyMutes(enabled = true): UseQueryResult<string[]>
export function useMuteUser(): UseMutation<void, Error, { targetUserId: string }>
export function useUnmuteUser(): UseMutation<void, Error, { targetUserId: string }>
export function useIsMuted(userId: string | null | undefined): boolean

export type MyReport = Database['public']['Functions']['get_my_reports_v2']['Returns'][number]
export function useMyReports(enabled = true): UseQueryResult<MyReport[]>
```

Behavior:
- `useMyMutes`: `from('user_mutes').select('muted_user_id')`, mapped to id
  array, queryKey `['my-mutes', userId]`. Small set; no pagination.
- `useMuteUser`/`useUnmuteUser`: direct `insert`/`delete` on `user_mutes`
  (RLS-gated), optimistic `setQueryData` on `['my-mutes']`, rollback on error.
  Self-mute rejected client-side before the call.
- `useIsMuted`: selector over `useMyMutes` cache, no extra query.
- `useMyReports`: `rpc('get_my_reports_v2')`, queryKey `['my-reports', userId]`,
  invalidated after any `report_member`/`report_post`/`report_comment` success
  (extend their `onSuccess` alongside the existing `['reports']`
  invalidation).

### 5.2 Filtering — where mute applies

| Surface | Hook point |
|---|---|
| `RoomView` timeline | Filter `messages.data` + `signals.data` by `author_id`; collapsed placeholder per item. |
| `MessageItem` reply quote | Collapse quote when `replyParent.author_id` muted. |
| `PostsFeedPage` / `PostDetailPage` / `CommentThread` | Filter posts + comments by `author_id`; same placeholder. |
| `SignalsView` / `SignalDetailPage` | Filter signals + replies by `author_id`. |
| `MembersView` / `ProfilePage` | No filtering (identity cards stay); mute toggle lives here. |

A shared helper in `moderation.ts` keeps the rule in one place:

```ts
export function isMutedAuthor(muted: Set<string>, authorId: string): boolean
```

`Show` override is per-item local `useState`, never persisted.

### 5.3 Routing — `src/app/router.tsx`

Under the existing member `AppShell` scope (no new shell):

```tsx
<Route path="/settings/reports" element={<MyReportsPage />} />
```

`/settings` itself gains a **Safety** section (see §5.5) linking there.
`/discovery` redirect precedent shows single-route additions need no layout
change.

### 5.4 Pages / components (new + touched)

New files:
- `src/pages/settings/MyReportsPage.tsx` — the `/settings/reports` list.
  Status pill, cluster name, reason label (`REPORT_REASONS`), target-kind
  label, `timeAgo` date, generic outcome line. `data-e2e="my-report-row"`.
- `src/components/MutedPlaceholder.tsx` — collapsed row ("Muted message from
  X — Show/Hide"), reused by chat, posts, comments, signals.
- `src/components/MuteButton.tsx` — toggle button with confirm-free UX
  (mute is reversible + private, no confirm modal). Props: `targetUserId`,
  `targetName`, compact/full variants for member card vs profile.

Touched files:
- `src/pages/SettingsPage.tsx` — Safety section: muted-users list with
  Unmute buttons + "My reports" link. Reuses card/section classes.
- `src/pages/cluster/MembersView.tsx` — per-card Mute/Unmute menu entry.
- `src/pages/ProfilePage.tsx` — mute button next to Report action (guarded:
  not on own profile).
- `src/components/ReportModal.tsx` — success state: "View my reports" link
  + "Also mute {name}" secondary button for member/message targets.
- `src/features/moderation.ts` — hooks above + report-mutation invalidations.
- `src/lib/database.types.ts` — `user_mutes` table + `get_my_reports_v2`
  signature, kept in sync by hand (no codegen script).

### 5.5 Settings Safety section sketch

```tsx
<section aria-label="Safety">
  <h2>Safety</h2>
  <Link to="/settings/reports">My reports →</Link>
  <ul>{mutes.map(m => <li>{name} <button>Unmute</button></li>)}</ul>
</section>
```

Placed between Notification preferences and Account, matching the existing
section-card pattern (`rounded-2xl border … bg-surface p-5 shadow-soft`).

### 5.6 Styling

`docs/DESIGN.md` tokens only. Status pills reuse the `SignalsView` pill
pattern (`bg-primary/10 text-primary` for open, neutral for closed). Muted
placeholder uses `bg-surface-container/40 border-dashed` (matches existing
empty states). No new colors, typefaces, or radii.

### 5.7 Realtime

None. Mutes are local to the viewer (no broadcast). Reports list refreshes on
mutation invalidation + mount refetch; live status flips arrive via the
existing `notifications` channel (`report resolved` email/notice), not a new
subscription.

---

## 6. Typed database (`src/lib/database.types.ts`)

Hand-sync (no codegen script): add `public.Tables.user_mutes`
Row/Insert/Update types and `public.Functions.get_my_reports_v2` Args/Returns.
Leave the legacy `get_my_reports` entry untouched.

---

## 7. Tests

### 7.1 Unit / component (colocated, Vitest + jsdom)

- `src/features/moderation.test.ts` (new): `useMyMutes` key + id mapping;
  mute/unmute optimistic insert/delete + rollback; self-mute guard;
  `useMyReports` rpc name + ordering passthrough; report mutations invalidate
  `['my-reports']`.
- `MutedPlaceholder.test.tsx`: renders name + Show, expands/collapses.
- `MuteButton.test.tsx`: toggles label, calls mute/unmute, disabled for self.
- `MyReportsPage.test.tsx`: empty state, row rendering (cluster/reason/kind/
  status pill), closed-outcome generic text contains no staff fixture data.

### 7.2 Integration — `tests/integration/safety.test.ts` (new)

Against the live stack (`supabase start`), seeded member JWTs:
- Mute RLS: own insert/select/delete succeed; reading another user's mutes
  returns none; self-mute rejected (`user_mutes_no_self`); unauthenticated
  gets nothing.
- `delete_my_account` cascades `user_mutes` both directions.
- `get_my_reports_v2`: reporter sees own rows with `cluster_name` +
  correct `target_kind` (member/message/post/comment); non-reporter sees none;
  closed rows expose status only (no assignee/notes columns in output).
- Suspended/banned reporter: `get_my_reports_v2` still reads (transparency
  must survive restriction); mute toggle blocked by `is_account_active`.

### 7.3 E2E — `e2e/safety.spec.ts` (new)

Seeded demo (`npm run seed:demo`): login → mute from Members → chat shows
placeholder → Show expands → Unmute from `/settings` restores; report a member
→ success shows "View my reports" → `/settings/reports` lists it with
`data-e2e="my-report-row"`. Select by `data-e2e` attributes only.

---

## 8. Docs updates

- `docs/TECHNICAL.md` — `moderation.ts` row (new hooks), `user_mutes` in
  schema/RLS tables, `get_my_reports_v2` in RPC list.
- `docs/ARCHITECTURE.md` — one line under Cluster Unlock or Moderation:
  mute is client-side personal filter; reports transparent via My Reports.
- `docs/PRD.md` — Blocking §: note mute shipped as the personal safeguard;
  Notification §: note My Reports screen now exists (resolves the
  "no report-history screen" caveat).

---

## 9. Sequencing

**Phase 1 — My Reports (shippable alone):** `0091` + types + `useMyReports` +
`MyReportsPage` + route + Settings link + `ReportModal` link + tests (§7.1
reports parts, §7.2 reports parts). No mute code.

**Phase 2 — Mute (shippable alone):** `0090` + types + mute hooks + filter
helper + `MutedPlaceholder`/`MuteButton` + Room/posts/signals filtering +
Members/Profile/Settings entry points + tests (§7.1 mute parts, §7.2 mute
parts, §7.3).

**Phase 3 — Polish:** `ReportModal` "Also mute" secondary, Safety empty
states, docs (§8). No new migrations.

---

## 10. Verification & risks

- **Migration order**: new files `0090`/`0091` only; `supabase db lint --local`
  + `supabase db reset` + `npm run test:integration` before pushing.
- **Pre-push**: `npm run lint`, `npm run test:coverage` (gate: lines 34%,
  funcs 33%, branches 20% — never lower), `npm run build`.
- **Realtime**: no publication changes, so no `supabase stop/start` needed.
- **Risk — mute vs moderation confusion**: mute hides content only for the
  muter; moderators still see everything. Copy must say "Only you" to avoid
  users thinking they reported.
- **Risk — `security definer` scope**: `get_my_reports_v2` filters by
  `auth.uid()` and joins `clusters` for the name only; grants to
  `authenticated` + `service_role` mirror `0053`. No staff columns leak by
  construction (they are not selected).
- **Risk — over-filtering**: reactions/presence/member counts must not filter,
  or votes/quorum UI breaks. Filter content authors only (§5.2 table).

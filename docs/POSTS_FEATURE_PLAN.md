# Posts Feature — Implementation Plan

A **Posts** surface: members share short posts (text + optional media: an uploaded
image or a GIF) inside their cluster, like them with a single heart, and comment in
a single threaded level. Posts are reportable and hideable by moderators exactly
like chat messages. The posts page is a standalone feed reached from the top nav —
not a cluster tab.

This document is the plan only. Default product decisions are locked (see §1);
everything else is phased so the work lands reviewable and testable. Read order:
[`PRD.md`](PRD.md) → [`ARCHITECTURE.md`](ARCHITECTURE.md) →
[`TECHNICAL.md`](TECHNICAL.md) → this plan → [`DESIGN.md`](DESIGN.md).

> **Status — implemented.** This plan was built out (migrations `0072`–`0082`),
> with the following refinements made during implementation and review: comments
> render as one **threaded** level under their parent (a reply to a reply is
> prefixed `@name`), comments and replies are **likable** (a heart, like posts),
> comment/reply and post-like **notifications** were shipped (Phase 2), and an
> **optional post title** was added. The live behavior is described in
> [`TECHNICAL.md`](TECHNICAL.md) § Posts.

---

## 1. Scope & decisions (locked)

| Question | Decision |
|---|---|
| **Where posts live** | A standalone **`/posts`** feed page under the top-level nav (in `AppShell`), laid out Reddit/Twitter-style as a thread column. The feed shows one **picked cluster** at a time (`useMyClusters` drives the selector). A post is still scoped to exactly one cluster. |
| **Detail page** | **`/posts/:postId`** — the post plus its threaded comment thread (deep-linkable from notifications/reports). |
| **Audience** | **Authenticated active members only** — read and write require `is_active_member(cluster_id)` and `cluster_unlocked(cluster_id)`. No public read; no cross-cluster feed. |
| **Post content** | Text body (≤ 2000 chars) **+ optional title** (≤ 200 chars) **+ at most one media** (an uploaded **image** or a **GIF**). A post must have at least one of text / image / GIF. |
| **Likes** | Single **heart** per user per post (`post_likes`) **and per comment/reply** (`comment_likes`), Instagram-style. No multi-emoji reaction set. |
| **Comments** | One **threaded** level: a comment can be replied to, and a reply can be replied to, but replies render as a single indented thread under the parent comment — a reply that targets another reply is prefixed `@name`. Text (≤ 1000 chars) + optional media. Author can delete their own. |
| **Moderation** | Posts and comments carry `moderation_status`; both are **reportable** (per-member open-report guard) and **hideable/restorable** by moderators, writing to `moderation_actions`. Hidden content is invisible to members. |
| **Author controls** | Edit own post content + title, soft-delete own post, delete own comment, like/unlike any comment. No edit of a soft-deleted post. |
| **Profile** | `ProfilePage` (`/profile/:userId`) gains a **"Posts"** section listing posts authored by that user in clusters the **viewer is an active member of** (RLS hides everything else). |

Explicitly **out of scope** for v1: a global (cross-cluster) feed, public
(unauthenticated) reading, post sharing outside the cluster, pinned posts,
tags/hashtags, deeper-than-one-level nesting, and multi-emoji reactions.

> **Product note.** The PRD positions Sensorium away from a broadcast/social-feed
> model, so the feed stays **cluster-scoped** even though its layout resembles
> Reddit/Twitter: you always pick one of your clusters and share with those members.

---

## 2. Product behavior contract

### 2.1 Posting
- Composer at the top of the selected cluster's feed (`/posts`): a text area, an
  image picker, and a GIF button (reusing the chat `GifPicker` + `useTrendingGifs`
  /`useSearchGifs`). A **single media** per post — image **or** GIF.
- On submit the post appears at the top of the feed; only active members of the
  cluster see it (RLS).
- Image upload runs through `prepareImage` (`src/lib/image.ts:17`), ~1600px max,
  same MIME set as `chat-images` (jpeg/png/webp/gif), ≤ 5 MiB. GIFs are **remote
  KLIPY URLs** (no upload), embedded the same way chat stores them.

### 2.2 Likes
- A heart toggle ("Like") on each post **and on each comment and reply**. One per
  user. The count is aggregate; the caller's heart fills if they've liked. Clicking
  again unlikes. No reaction picker. Likes apply optimistically in the UI.

### 2.3 Comments
- One threaded level: a top-level comment has an indented reply thread beneath it;
  any comment in that thread can be replied to, and a reply to a reply is prefixed
  with `@name` (Instagram-style). Each comment is individually deletable by its
  author and show its own like count; a top-level comment also shows its reply count.

### 2.4 Moderation
- Posts/comments carry `moderation_status` (`image_moderation_status`, default
  `'approved'`). `SELECT` RLS only returns rows where `moderation_status =
  'approved'`.
- Members report a post or comment within their cluster (dedicated RPCs, §3.5). One
  open report per reporter·target still applies.
- Moderators hide/restore posts/comments from `ModerationCasePage`, emitting a
  `moderation_notice` to the author (existing pipeline) + an audit row.

### 2.5 Notifications (shipped)
- `post_comment` and `post_like` notifications are emitted (not the author on a
  comment/reply, reply-target author on a reply, post author on a like) and gated by
  `notification_prefs` at read-time. Enum/preference values were added up front.

---

## 3. Database

All new schema is **new ordered migrations** beginning at `0072` (after `0071`).
Files are never edited once applied.

| File | Contents |
|---|---|
| `0072_posts_schema.sql` | `posts`, `post_comments` (reply target added in 0077), `post_likes`; `reports` + `moderation_actions` columns; enum additions; indexes; RLS. |
| `0073_posts_functions.sql` | Member RPCs (`create_post`, `edit_post`, `delete_post`, `toggle_post_like`, `create_post_comment`, `delete_post_comment`) and moderator RPCs (`report_post`, `report_post_comment`, `hide_post`, `restore_post`, `hide_post_comment`, `restore_post_comment`). |
| `0074_posts_realtime.sql` | Realtime publication + `realtime.subscription` registration for the three new tables. |
| `0075_posts_storage.sql` | `posts-images` bucket + `storage.objects` policies. |
| `0076_posts_grants.sql` | `authenticated`/`service_role` grants on the new tables and functions (mirrors `0017`/`0019`). |
| `0077_posts_comment_replies.sql` | `post_comments.parent_comment_id` reply target + RPC arg (reply to any comment). |
| `0078_posts_comment_reply_clear_overload.sql` | drops the stale 4-arg `create_post_comment` overload so PostgREST stays unambiguous. |
| `0079_posts_comment_reply_any.sql` | relaxes the reply target to any comment (not just top-level); error `invalid_reply_target`. |
| `0080_posts_notifications.sql` | `notification_prefs.post_comment`/`post_like` columns, `notification_allowed` routing, and notification emission in `create_post_comment`/`toggle_post_like`. |
| `0081_posts_title.sql` | optional `posts.title` (≤ 200), `create_post`/`edit_post` gain `p_title`. |
| `0082_comment_likes.sql` | `comment_likes` table + RLS, `toggle_comment_like`, realtime, grants. |

### 3.1 Tables

```sql
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text,               -- optional post title
  content text,
  image_url text,        -- bare storage path in posts-images
  gif_url text,          -- remote KLIPY url (no upload)
  edited_at timestamptz,
  deleted_at timestamptz,
  moderation_status public.image_moderation_status not null default 'approved',
  created_at timestamptz not null default now(),
  constraint posts_has_content check (
    content is not null or image_url is not null or gif_url is not null
  ),
  constraint posts_content_len check (content is null or char_length(content) between 1 and 2000),
  constraint posts_title_len check (title is null or char_length(title) between 1 and 200),
  constraint posts_single_media check (image_url is null or gif_url is null)
);

create index posts_cluster_idx on public.posts (cluster_id, created_at desc, id desc)
  where deleted_at is null and moderation_status = 'approved';

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.post_comments(id) on delete set null,
  content text,
  image_url text,
  gif_url text,
  deleted_at timestamptz,
  moderation_status public.image_moderation_status not null default 'approved',
  created_at timestamptz not null default now(),
  constraint comments_has_content check (
    content is not null or image_url is not null or gif_url is not null
  ),
  constraint comments_content_len check (content is null or char_length(content) between 1 and 1000),
  constraint comments_single_media check (image_url is null or gif_url is null)
);

create index post_comments_post_idx on public.post_comments (post_id, created_at asc);
create index post_comments_parent_idx on public.post_comments (parent_comment_id)
  where parent_comment_id is not null;

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comment_likes (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
```

Notes:
- **Comments carry a `parent_comment_id`** (the reply target). Any comment can be
  replied to; replies render as one indented thread under their top-level comment,
  and a reply to a reply is prefixed with `@name`. One visual level, no deeper
  nesting.
- `moderation_status` reuses `public.image_moderation_status` (`0025`); no new enum.
- **GIFs are first-class columns** (`gif_url`), not the chat `gif:`-prefix-in-content
  hack — posts/comments can hold text *and* media, which the chat model can't.
- Likes/comments carry no cluster column; realtime/caching routes via a
  `posts.cluster_id` lookup (like `message_reactions` is routed today).
- Soft delete (`deleted_at`) keeps moderation/report history while removing content
  from view; a deleted post's image is reclaimed from storage.

### 3.2 Enum additions (additive)

```sql
alter type public.notification_type add value 'post_comment';
alter type public.notification_type add value 'post_like';

alter type public.moderation_action_type add value 'post_hidden';
alter type public.moderation_action_type add value 'post_restored';
alter type public.moderation_action_type add value 'post_comment_hidden';
alter type public.moderation_action_type add value 'post_comment_restored';
```
(Add enum values before any table/function that references them; migrations run in
order. `moderation_action_type` was created in `0052`.)

### 3.3 Report / audit plumbing

```sql
alter table public.reports
  add column post_id uuid references public.posts(id) on delete set null,
  add column comment_id uuid references public.post_comments(id) on delete set null;

create index reports_post_id_idx on public.reports (post_id) where post_id is not null;
create index reports_comment_id_idx on public.reports (comment_id) where comment_id is not null;

alter table public.moderation_actions
  add column post_id uuid references public.posts(id) on delete set null,
  add column comment_id uuid references public.post_comments(id) on delete set null;
```

A report either has a `message_id` (chat) or a `post_id`/`comment_id` (posts) —
never more than one category (enforced in the RPC, §3.5).

### 3.4 RLS policies (in `0072`)

Every table enabled, guarded with `is_active_member` + `cluster_unlocked` +
`is_account_active`:

```sql
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;

create policy "posts read unlocked cluster"
  on public.posts for select
  using (
    public.is_active_member(cluster_id)
    and public.cluster_unlocked(cluster_id)
    and deleted_at is null
    and moderation_status = 'approved'
  );

create policy "posts insert own cluster"
  on public.posts for insert
  with check (
    public.is_active_member(cluster_id)
    and public.cluster_unlocked(cluster_id)
    and auth.uid() = author_id
    and public.is_account_active(auth.uid())
  );

create policy "posts author update"
  on public.posts for update
  using (auth.uid() = author_id and public.is_account_active(auth.uid()))
  with check (auth.uid() = author_id and public.is_account_active(auth.uid()));

revoke update on public.posts from authenticated;
grant update (content, edited_at, deleted_at) on public.posts to authenticated;

create policy "post comments read unlocked cluster"
  on public.post_comments for select
  using (
    public.is_active_member((select cluster_id from public.posts where id = post_id))
    and public.cluster_unlocked((select cluster_id from public.posts where id = post_id))
    and deleted_at is null
    and moderation_status = 'approved'
  );

create policy "post comments insert own"
  on public.post_comments for insert
  with check (
    auth.uid() = author_id
    and public.is_account_active(auth.uid())
    and public.is_active_member((select cluster_id from public.posts where id = post_id))
  );

create policy "post comments author delete"
  on public.post_comments for delete
  using (auth.uid() = author_id and public.is_account_active(auth.uid()));

create policy "post likes read"
  on public.post_likes for select
  using (public.is_active_member((select cluster_id from public.posts where id = post_id)));

create policy "post likes insert own"
  on public.post_likes for insert
  with check (
    auth.uid() = user_id
    and public.is_account_active(auth.uid())
    and public.is_active_member((select cluster_id from public.posts where id = post_id))
  );

create policy "post likes delete own"
  on public.post_likes for delete
  using (
    auth.uid() = user_id
    and public.is_account_active(auth.uid())
    and public.is_active_member((select cluster_id from public.posts where id = post_id))
  );
```

Follow `0054`'s `drop policy if exists` convention for reuse; these are all-new
policy names so `create policy` is fine on a fresh `supabase db reset`.

### 3.5 RPC functions (in `0073`)

Every member mutation starts with `perform public.assert_account_can_write();` and
validates membership + unlocked cluster. Use the `security definer set search_path =
public` style of `0054`.

```
create_post(p_cluster_id uuid, p_content text, p_image_url text, p_gif_url text, p_title text) returns uuid
edit_post(p_post_id uuid, p_content text, p_title text) returns void
delete_post(p_post_id uuid) returns void          -- soft delete + storage reclaim
toggle_post_like(p_post_id uuid) returns void
toggle_comment_like(p_comment_id uuid) returns void
create_post_comment(p_post_id uuid, p_content text, p_image_url text, p_gif_url text, p_parent_comment_id uuid) returns uuid
delete_post_comment(p_comment_id uuid) returns void

report_post(p_cluster_id uuid, p_post_id uuid, p_reason report_reason, p_details text) returns uuid
report_post_comment(p_cluster_id uuid, p_comment_id uuid, p_reason report_reason, p_details text) returns uuid

hide_post(p_post_id uuid, p_reason text, p_report_id uuid default null) returns void
restore_post(p_post_id uuid, p_reason text, p_report_id uuid default null) returns void
hide_post_comment(p_comment_id uuid, p_reason text, p_report_id uuid default null) returns void
restore_post_comment(p_comment_id uuid, p_reason text, p_report_id uuid default null) returns void
```

Behavior:
- **`create_post`**: requires text and/or media (mirrors `send_message`'s
  `empty_message` guard), validates the single-media rule + optional title, returns
  the new post id.
- **`delete_post`**: soft-deletes (`deleted_at = now()`), reclaims the author's
  `posts-images` object server-side (via `storage.allow_delete_query`, mirroring
  `delete_my_account`). RLS hides the soft-deleted post and its comments/likes.
- **`toggle_post_like` / `toggle_comment_like`**: insert if absent else delete,
  atomically and guarded (server-side equivalent of a client heart toggle) — avoids
  a read-then-write race. `toggle_post_like` also emits a `post_like` notification.
- **`create_post_comment`**: validates the optional reply target (`p_parent_comment_id`
  must exist on the same post), and emits a `post_comment` notification to the post
  author (and, on a reply, the parent-comment author).
- **`report_post` / `report_post_comment`**: derive `target_user_id` from the
  author, reject self-reports, reject non-members (caller + target active in the
  same cluster), enforce the one-open-report-per-target rule, verify the content
  belongs to that cluster and is reportable.
- **`hide_post` / `restore_post` / `hide_post_comment` / `restore_post_comment`**:
  guarded by `perform public.assert_can_moderate();`, require a non-empty reason,
  flip `moderation_status` between `'rejected'`/`'approved'`, write a
  `moderation_actions` row with the matching new action type, close the report as
  actioned (when `p_report_id` is passed), and emit the author-facing
  `moderation_notice` notification (reuse the `0066`/`0070` enqueue pattern).

Grants in `0076`: `grant execute ... to authenticated` for all the above; the member
functions also granted to `service_role` (consistent with `0019`).

---

## 4. Storage

New private bucket for post/comment images, mirroring the `chat-images` lifecycle
(`0021`/`0030`/`0031`). GIFs are remote KLIPY URLs and need no storage.

In `0075_posts_storage.sql`:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'posts-images', 'posts-images', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy posts_images_member_write
  on storage.objects for insert
  with check (bucket_id = 'posts-images' and public.is_active_member(split_part(name, '/', 1)::uuid));

create policy posts_images_member_update
  on storage.objects for update
  using (bucket_id = 'posts-images' and public.is_active_member(split_part(name, '/', 1)::uuid));

create policy posts_images_member_read
  on storage.objects for select
  using (bucket_id = 'posts-images' and public.is_active_member(split_part(name, '/', 1)::uuid));
```

The bucket is **private from day one** so the client always uses `createSignedUrl`.
Object path first segment = cluster id (same convention as `chat-images`).

---

## 5. Frontend

### 5.1 Feature module — `src/features/posts.ts` (new)

Wraps TanStack Query; components never touch Supabase directly. Types come from the
regenerated `Database` type (§6).

```ts
export type Post        = Database['public']['Tables']['posts']['Row']
export type PostComment = Database['public']['Tables']['post_comments']['Row']
export type PostLike    = Database['public']['Tables']['post_likes']['Row']
export type CommentLike = Database['public']['Tables']['comment_likes']['Row']

export const POSTS_PAGE_SIZE = 30

useClusterPosts(clusterId): UseQueryResult<Post[]>               // newest first, merge-preserving
useLoadEarlierPosts(clusterId): UseMutation                       // prepend an older page
useUserPosts(authorId): UseQueryResult<Post[]>                      // profile "Posts" section
useClusterPostLikes(clusterId, postIds): UseQueryResult<PostLike[]>
useClusterCommentLikes(clusterId, commentIds): UseQueryResult<CommentLike[]>
useClusterPostComments(clusterId, postIds): UseQueryResult<PostComment[]>
useCreatePost(clusterId): UseMutation                             // content + optional title + media
useEditPost(clusterId): UseMutation                               // content + optional title
useDeletePost(clusterId): UseMutation
useTogglePostLike(clusterId): UseMutation                         // optimistic
useToggleCommentLike(clusterId): UseMutation                      // optimistic
useCreateComment(clusterId): UseMutation                          // content/media + optional reply target
useDeleteComment(clusterId): UseMutation
useReportPost(clusterId): UseMutation
useReportComment(clusterId): UseMutation

export function postImageStoragePath(stored): string | null   // mirror chatImageStoragePath
export function usePostImageUrl(path): UseQueryResult<string> // signed URL + refresh (nullable)
export async function uploadPostImage(clusterId, file): Promise<string>  // bare path
```

Query keys follow existing naming (`cluster-posts`, `post-comments`,
`post-likes`). Comments/likes are fetched in bulk per cluster (like
`useSignalReplies(clusterId, null)`), then grouped client-side by `post_id`, so one
query keeps the whole thread list live under a single subscription/refetch.

### 5.2 Realtime — `src/features/realtime.ts`

Extend `useClusterChannel` with the new builders, routing likes/comments through a
`posts.cluster_id` lookup (like `patchReaction`/`patchSignalReply`):

- `INSERT` on `posts` (filter `cluster_id=eq`) → prepend to `['cluster-posts', id]`.
- `UPDATE` on `posts` (filter `cluster_id=eq`) → map/replace in cache (edits, soft
  deletes, moderation flips).
- `INSERT`/`DELETE` on `post_likes` → `patchPostLike`.
- `INSERT`/`DELETE` on `comment_likes` → `patchCommentLike` (routed via comment →
  post → cluster).
- `INSERT` on `post_comments` → patch the `['post-comments', clusterId, 'all']` cache
  (comments carry no cluster id; look up the owning cluster first).

Note: the feed/section pages mount `useClusterChannel` (or a posts-only variant) to
stay live. The realtime channel is per-cluster, so the `/posts` feed subscribes
only to the currently selected cluster.

### 5.3 Routing — `src/app/router.tsx`

Add under the member `AppShell` scope (top-level, not inside `ClusterLayout`):

```tsx
<Route path="/posts" element={<PostsFeedPage />} />
<Route path="/posts/:postId" element={<PostDetailPage />} />
```

### 5.4 Top nav — `src/app/layouts/AppShell.tsx`

Add to `navItems` (both desktop and the mobile bottom bar):

```tsx
{ to: '/posts', label: 'Posts', icon: Newspaper },
```
(`Newspaper` or `PenLine` from `lucide-react`, thin stroke.)

### 5.5 Pages / components

New files:
- `src/pages/posts/PostsFeedPage.tsx` — the `/posts` feed. A **cluster selector**
  driven by `useMyClusters`, a composer, a single-column thread list of posts
  (Reddit/Twitter style), and a **Load earlier** affordance. Only the selected
  cluster's posts are shown.
- `src/pages/posts/PostDetailPage.tsx` — single post + its threaded comment thread.
- `src/components/PostCard.tsx` — author, timestamp, optional title, body, media, a
  heart "Like" toggle + count, a comment count, and an overflow menu (Copy link /
  Edit / Delete / Report).
- `src/components/PostComposer.tsx` — reusable text+media composer with an optional
  title field, image picker, and GIF button (existing `GifPicker`).
- `src/components/PostMedia.tsx` — renders the single media (image/GIF) and opens a
  full-screen lightbox on click.
- `src/components/CommentThread.tsx` and `src/components/CommentItem.tsx` — one
  threaded level (parent comment + indented replies, `@name` on reply-to-reply),
  each comment likable with a heart + count, top-level comments show a reply count.

Reuse existing pieces: `useMyClusters` (`matching.ts:56`), `Avatar`, `Modal`,
`ReportModal` (extended for a post/comment target, §5.8), `GifPicker`,
`useTrendingGifs`/`useSearchGifs` (`gifs.ts`), `useDocumentTitle`, card/pill classes
from `SignalsView`, and the room's media-render helpers.

### 5.6 Profile posts — `src/pages/ProfilePage.tsx`

Add a "Posts" section below the intro answers, listing posts authored by the viewed
user that the caller can see (RLS scopes it to clusters they share). Data via
`useUserPosts(authorId)`. Each card links to `/posts/:postId`.

### 5.7 Styling

Stick to `docs/DESIGN.md` tokens. No new colors, typefaces, or radii. Use
`rounded-2xl`, `shadow-soft`/`shadow-lift`, `bg-surface`,
`text-on-surface-variant` for meta, the pill pattern (`bg-primary/10 text-primary`)
for any badge, and the `SignalsView` textarea classes for the composer. The heart
toggle uses the existing `--color-error` for the filled state (like Instagram's red
heart) and `text-on-surface-variant` for the unfilled outline.

### 5.8 Reporting from the UI

`ReportModal` currently takes `messageId?: string`. Add an optional `contentTarget`
prop `{ kind: 'message' | 'post' | 'comment'; id: string }` and route to
`useReportPost`/`useReportComment` when present, falling back to `useReportMember`.
Keep the member/day report path working so chat is unaffected.

---

## 6. Typed database (`src/lib/database.types.ts`)

There is no codegen script; the file is kept in sync by hand after the migrations.
Update `public.Tables` with `posts`, `post_comments`, `post_likes`, `comment_likes`
Row/Insert/Update types, the new `post_id`/`comment_id` columns on `reports` and
`moderation_actions`, the new `notification_type`/`moderation_action_type` enum
values, and the new RPC signatures under `Functions`.

---

## 7. Tests

### 7.1 Unit / component — `src/features/posts.test.ts(x)`

- Mock `supabase.rpc`, `supabase.from`, `supabase.storage` (mirror
  `signals.test.tsx`/`cluster.test.tsx`).
- Cover: list query key + ordering + merge-preserving pagination; create/edit/delete
  mutations and invalidations (incl. `p_title`); **optimistic** post + comment like
  toggles; comment reply target; comment list grouping; signed-URL hook; the
  storage-path normalizer (`postImageStoragePath`).

### 7.2 Component

- `PostCard.test.tsx`: author/time/body/title rendering, media, heart toggle +
  count, comment count, overflow menu (Copy link / Edit / Delete / Report).
- `CommentItem.test.tsx`: author/time/`@name` prefix, like count + reply count render,
  like click, Reply/Delete/Report actions.

### 7.3 Integration — `tests/integration/posts.test.ts`

Against the live Supabase stack, exercising RLS + RPC (mirror
`governance.test.ts`/`rls.test.ts` with seeded member JWT):
- Member read/write gating: only active members of an unlocked cluster see posts;
  locked clusters, non-members, suspended/`banned` accounts are rejected.
- `create_post` requires text and/or media; length guards; **single-media rule**;
  optional title.
- `toggle_post_like` / `toggle_comment_like` idempotency + authorization.
- comment/reply creation, one-level threading, reply-to-any comment, like/unlike.
- Comment/reply and like **notifications** to the right author, gated by prefs.
- `report_post` guards: self-report, duplicate open report, non-member, wrong cluster.
- `hide_post`/`restore_post` flip visibility; hidden post invisible to members;
  audit row written; `moderation_notice` notification enqueued for the author.
- Storage: `posts-images` private; `createSignedUrl` succeeds only for active
  members; post-image cleanup on `delete_post`.

### 7.4 E2E — `e2e/posts.spec.ts`

From the top nav → Posts → pick a cluster → create a post (and a GIF) → it appears
→ like it → comment → report from the post menu. Select by `data-e2e` attributes.

---

## 8. Docs updates

- `docs/TECHNICAL.md` — add `posts.ts` to the feature-module table, note the
  `posts-images` bucket in the Storage table, and document the new tables/RLS.
- `docs/ARCHITECTURE.md` — add Posts to the communication/feature list if warranted.

---

## 9. Sequencing

**Phase 1 — shippable core:** schema + RLS (§3), member + moderator RPCs (§3.5),
storage (§4), feature module + realtime (§5.1–5.2), `/posts` feed + detail + composer
+ cards (§5.3–5.5), profile posts section (§5.6), typed update (§6), unit/component
+ integration tests (§7), docs (§8).

**Phase 2 — interactions & notifications (shipped):** `post_comment` and `post_like`
notifications honoring `notification_prefs`, plus comment/reply likes and the
optional post title.

**Phase 3 — polish (mostly shipped):** optimistic post + comment likes, image
lightbox, feed "Load earlier" pagination, per-post "Copy link". **Comment
pagination** was intentionally left out — for a cluster of 8 the threads are tiny,
and paginating them would complicate the threaded/realtime grouping for little gain.

---

## 10. Verification & risks

- **Migration order**: never edit an applied migration; land as new files 0072+.
  Realtime changes require `supabase stop && supabase start` to re-register.
- **`db reset` idempotency**: `supabase db lint --local` + `supabase db reset` +
  `npm run test:integration` before pushing.
- **Pre-push**: `npm run lint`, `npm run test:coverage`, `npm run build`; if
  migrations changed, also `supabase db reset` + `npm run test:integration`.
- **Known decisions confirmed during build**: single media per post/comment
  (`posts_single_media`), the feed defaults to the first cluster when the user has
  several, and the heart-fill uses the existing `--color-error` token.
- **Risk — report schema cohesion**: `report_member` is a single tightly-guarded
  overload; posts use dedicated `report_post`/`report_post_comment` RPCs rather than
  widening it, to avoid destabilizing chat reporting (see `0057` which already
  dropped one overload).
- **Risk — comment replies**: comments carry `parent_comment_id` and render one
  threaded level (a reply to a reply is prefixed `@name`). Newer PostgREST overloads
  must be dropped before a signature changes (the `0057`/`0078` lesson).


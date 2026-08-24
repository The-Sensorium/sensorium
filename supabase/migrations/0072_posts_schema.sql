-- 0072_posts_schema.sql
-- Cluster-scoped posts: a post has a text body + at most one media (an uploaded
-- image or a remote GIF), a single heart per user, and a flat (non-nested)
-- comment thread. Posts and comments are reportable and hideable like chat
-- messages. Follows 0071. Idempotent via db reset.

-- -- 0) Additive enum values ------------------------------------------------
-- (Must precede any table/function that references them.)

alter type public.notification_type add value 'post_comment';
alter type public.notification_type add value 'post_like';

alter type public.moderation_action_type add value 'post_hidden';
alter type public.moderation_action_type add value 'post_restored';
alter type public.moderation_action_type add value 'post_comment_hidden';
alter type public.moderation_action_type add value 'post_comment_restored';

-- -- 1) Tables --------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  image_url text,
  gif_url text,
  edited_at timestamptz,
  deleted_at timestamptz,
  moderation_status public.image_moderation_status not null default 'approved',
  created_at timestamptz not null default now(),
  constraint posts_has_content check (
    content is not null or image_url is not null or gif_url is not null
  ),
  constraint posts_content_len check (content is null or char_length(content) between 1 and 2000),
  constraint posts_single_media check (image_url is null or gif_url is null)
);

create index posts_cluster_idx on public.posts (cluster_id, created_at desc, id desc)
  where deleted_at is null and moderation_status = 'approved';

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
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

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- -- 2) Report / audit plumbing ---------------------------------------------

alter table public.reports
  add column post_id uuid references public.posts(id) on delete set null,
  add column comment_id uuid references public.post_comments(id) on delete set null;

create index reports_post_id_idx on public.reports (post_id) where post_id is not null;
create index reports_comment_id_idx on public.reports (comment_id) where comment_id is not null;

alter table public.moderation_actions
  add column post_id uuid references public.posts(id) on delete set null,
  add column comment_id uuid references public.post_comments(id) on delete set null;

-- -- 3) Row Level Security --------------------------------------------------

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

-- Narrow the author update grant to content/edited_at/deleted_at only, so
-- moderation columns (and anything else) are not reachable through REST.
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

-- 0139_child_cluster_id.sql
-- Denormalize cluster_id onto realtime-routed child tables so Postgres
-- Changes subscriptions can filter by cluster and per-event parent lookups
-- (plus per-row parent-subselect RLS on reads) go away.
--
-- Tables: message_reactions, signal_replies, post_likes, post_comments,
-- comment_likes, call_participants. vote_responses is deliberately excluded:
-- nothing subscribes to it and it is not published; its PK covers lookups.
--
-- Safety design:
--   1. BEFORE INSERT triggers FORCE (not fill) NEW.cluster_id from the
--      parent. A fill-only trigger would let a client insert a forged
--      cluster_id for a cluster they belong to while attached to another
--      cluster's parent — and direct-cluster_id RLS would pass. Forcing
--      makes RLS on cluster_id sound by construction, and self-heals any
--      write site that forgets the column.
--   2. Only READ policies are rewritten (the hot path: every list fetch and
--      every realtime event evaluates them). Single-row insert/delete
--      policies keep their parent subselects.
--   3. Write RPCs set the column explicitly from values already in scope
--      (live bodies: reply_signal 0022, toggles 0106/0080/0082, create_post
--      0098, create_post_comment 0099, start_call 0110, join_call 0111).
--   4. No publication change: all six tables are already published
--      (0021/0074/0082/0107), so no realtime restart is needed. Old clients
--      (mobile) keep working with unfiltered subscriptions.

-- -- 1) Columns (nullable for the backfill; NOT NULL at §6) ---------------------

alter table public.message_reactions
  add column cluster_id uuid references public.clusters(id) on delete cascade;
alter table public.signal_replies
  add column cluster_id uuid references public.clusters(id) on delete cascade;
alter table public.post_likes
  add column cluster_id uuid references public.clusters(id) on delete cascade;
alter table public.post_comments
  add column cluster_id uuid references public.clusters(id) on delete cascade;
alter table public.comment_likes
  add column cluster_id uuid references public.clusters(id) on delete cascade;
alter table public.call_participants
  add column cluster_id uuid references public.clusters(id) on delete cascade;

-- -- 2) Backfill from parents (FK-guaranteed total) -----------------------------

update public.message_reactions r
set cluster_id = m.cluster_id
from public.messages m where m.id = r.message_id and r.cluster_id is null;

update public.signal_replies r
set cluster_id = s.cluster_id
from public.signals s where s.id = r.signal_id and r.cluster_id is null;

update public.post_likes l
set cluster_id = p.cluster_id
from public.posts p where p.id = l.post_id and l.cluster_id is null;

update public.post_comments c
set cluster_id = p.cluster_id
from public.posts p where p.id = c.post_id and c.cluster_id is null;

update public.comment_likes l
set cluster_id = p.cluster_id
from public.post_comments pc
join public.posts p on p.id = pc.post_id
where pc.id = l.comment_id and l.cluster_id is null;

update public.call_participants cp
set cluster_id = c.cluster_id
from public.calls c where c.id = cp.call_id and cp.cluster_id is null;

-- -- 3) Force-overwrite insert triggers -----------------------------------------

create function public.force_child_cluster_id() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cluster uuid;
begin
  case TG_TABLE_NAME
    when 'message_reactions' then
      select m.cluster_id into v_cluster
      from public.messages m where m.id = NEW.message_id;
    when 'signal_replies' then
      select s.cluster_id into v_cluster
      from public.signals s where s.id = NEW.signal_id;
    when 'post_likes' then
      select p.cluster_id into v_cluster
      from public.posts p where p.id = NEW.post_id;
    when 'post_comments' then
      select p.cluster_id into v_cluster
      from public.posts p where p.id = NEW.post_id;
    when 'comment_likes' then
      select p.cluster_id into v_cluster
      from public.post_comments pc
      join public.posts p on p.id = pc.post_id
      where pc.id = NEW.comment_id;
    when 'call_participants' then
      select c.cluster_id into v_cluster
      from public.calls c where c.id = NEW.call_id;
    else
      raise exception 'force_child_cluster_id: unexpected table %', TG_TABLE_NAME;
  end case;
  if v_cluster is null then
    raise exception 'parent_not_found';
  end if;
  NEW.cluster_id := v_cluster;
  return NEW;
end; $$;

revoke execute on function public.force_child_cluster_id()
  from public, anon, authenticated;

drop trigger if exists force_cluster_id on public.message_reactions;
create trigger force_cluster_id
  before insert on public.message_reactions
  for each row execute function public.force_child_cluster_id();

drop trigger if exists force_cluster_id on public.signal_replies;
create trigger force_cluster_id
  before insert on public.signal_replies
  for each row execute function public.force_child_cluster_id();

drop trigger if exists force_cluster_id on public.post_likes;
create trigger force_cluster_id
  before insert on public.post_likes
  for each row execute function public.force_child_cluster_id();

drop trigger if exists force_cluster_id on public.post_comments;
create trigger force_cluster_id
  before insert on public.post_comments
  for each row execute function public.force_child_cluster_id();

drop trigger if exists force_cluster_id on public.comment_likes;
create trigger force_cluster_id
  before insert on public.comment_likes
  for each row execute function public.force_child_cluster_id();

drop trigger if exists force_cluster_id on public.call_participants;
create trigger force_cluster_id
  before insert on public.call_participants
  for each row execute function public.force_child_cluster_id();

-- -- 4) Read policies: direct cluster_id, same row visibility -------------------
-- Insert/delete policies are untouched (single-row; parent subselects stay).

drop policy if exists "reactions read" on public.message_reactions;
create policy "reactions read"
  on public.message_reactions for select
  using (public.is_active_member(cluster_id));

drop policy if exists "signal replies read own cluster" on public.signal_replies;
create policy "signal replies read own cluster"
  on public.signal_replies for select
  using (public.is_active_member(cluster_id));

drop policy if exists "post comments read unlocked cluster" on public.post_comments;
create policy "post comments read unlocked cluster"
  on public.post_comments for select
  using (
    public.is_active_member(cluster_id)
    and public.cluster_unlocked(cluster_id)
    and deleted_at is null
    and moderation_status = 'approved'
  );

drop policy if exists "post likes read" on public.post_likes;
create policy "post likes read"
  on public.post_likes for select
  using (public.is_active_member(cluster_id));

drop policy if exists "comment likes read" on public.comment_likes;
create policy "comment likes read"
  on public.comment_likes for select
  using (public.is_active_member(cluster_id));

drop policy if exists "call participants read members" on public.call_participants;
create policy "call participants read members"
  on public.call_participants for select
  using (public.is_active_member(cluster_id));

-- -- 5) Write RPCs set cluster_id explicitly (live bodies + one column) --------

-- reply_signal: live body is 0022.
create or replace function public.reply_signal(p_signal_id uuid, p_content text) returns void
language plpgsql security definer set search_path = public as $$
declare v_cluster uuid;
begin
  select cluster_id into v_cluster from public.signals where id = p_signal_id;
  if v_cluster is null then raise exception 'signal_not_found'; end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = v_cluster and user_id = auth.uid() and left_at is null
  ) then raise exception 'not_a_member'; end if;

  insert into public.signal_replies (signal_id, author_id, content, cluster_id)
  values (p_signal_id, auth.uid(), p_content, v_cluster);
end; $$;

-- toggle_message_reaction: live body is 0106.
create or replace function public.toggle_message_reaction(p_message_id uuid, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_member uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if p_emoji is null or char_length(p_emoji) < 1 then raise exception 'emoji_required'; end if;

  select cluster_id into v_cluster from public.messages where id = p_message_id;
  if v_cluster is null then raise exception 'message_not_found'; end if;
  if not (public.is_active_member(v_cluster) and public.cluster_unlocked(v_cluster)) then
    raise exception 'reactions_locked';
  end if;

  perform public.check_rate_limit('toggle', 120, interval '1 hour');

  select user_id into v_member from public.message_reactions
  where message_id = p_message_id and user_id = v_actor and emoji = p_emoji;
  if v_member is null then
    insert into public.message_reactions (message_id, user_id, emoji, cluster_id)
    values (p_message_id, v_actor, p_emoji, v_cluster);
  else
    delete from public.message_reactions
    where message_id = p_message_id and user_id = v_actor and emoji = p_emoji;
  end if;
end; $$;

-- toggle_post_like: live body is 0080 §4.
create or replace function public.toggle_post_like(p_post_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_author uuid;
  v_member uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select cluster_id, author_id into v_cluster, v_author
  from public.posts where id = p_post_id;
  if v_cluster is null then raise exception 'post_not_found'; end if;
  if not (public.is_active_member(v_cluster) and public.cluster_unlocked(v_cluster)) then
    raise exception 'posts_locked';
  end if;

  perform public.check_rate_limit('toggle', 120, interval '1 hour');

  select user_id into v_member from public.post_likes
  where post_id = p_post_id and user_id = v_actor;
  if v_member is null then
    insert into public.post_likes (post_id, user_id, cluster_id)
    values (p_post_id, v_actor, v_cluster);

    if v_author is not null and v_author <> v_actor then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      values (v_author, 'post_like', v_cluster,
              (select display_name from public.profiles where id = v_actor) || ' liked your post',
              null, jsonb_build_object('post_id', p_post_id));
    end if;
  else
    delete from public.post_likes where post_id = p_post_id and user_id = v_actor;
  end if;
end; $$;

-- toggle_comment_like: live body is 0082.
create or replace function public.toggle_comment_like(p_comment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_member uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select p.cluster_id into v_cluster
  from public.post_comments pc
  join public.posts p on p.id = pc.post_id
  where pc.id = p_comment_id and pc.deleted_at is null;
  if v_cluster is null then raise exception 'comment_not_found'; end if;
  if not (public.is_active_member(v_cluster) and public.cluster_unlocked(v_cluster)) then
    raise exception 'comments_locked';
  end if;

  perform public.check_rate_limit('toggle', 120, interval '1 hour');

  select user_id into v_member from public.comment_likes
  where comment_id = p_comment_id and user_id = v_actor;
  if v_member is null then
    insert into public.comment_likes (comment_id, user_id, cluster_id)
    values (p_comment_id, v_actor, v_cluster);
  else
    delete from public.comment_likes where comment_id = p_comment_id and user_id = v_actor;
  end if;
end; $$;

-- create_post: live body is 0098 (self-like included).
create or replace function public.create_post(
  p_cluster_id uuid,
  p_content text default null,
  p_image_url text default null,
  p_gif_url text default null,
  p_title text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  if not (public.is_active_member(p_cluster_id) and public.cluster_unlocked(p_cluster_id)) then
    raise exception 'posts_locked';
  end if;
  if p_content is null and p_image_url is null and p_gif_url is null then
    raise exception 'empty_post';
  end if;
  if p_content is not null and (char_length(p_content) < 1 or char_length(p_content) > 2000) then
    raise exception 'content_out_of_range';
  end if;
  if p_image_url is not null and p_gif_url is not null then
    raise exception 'single_media_only';
  end if;
  if p_title is not null and (char_length(p_title) < 1 or char_length(p_title) > 200) then
    raise exception 'title_out_of_range';
  end if;

  insert into public.posts (cluster_id, author_id, content, image_url, gif_url, title)
  values (p_cluster_id, auth.uid(), p_content, p_image_url, p_gif_url, p_title)
  returning id into v_id;

  insert into public.post_likes (post_id, user_id, cluster_id)
  values (v_id, auth.uid(), p_cluster_id)
  on conflict do nothing;

  return v_id;
end; $$;

-- create_post_comment: live body is 0099 (self-like included).
create or replace function public.create_post_comment(
  p_post_id uuid,
  p_content text default null,
  p_image_url text default null,
  p_gif_url text default null,
  p_parent_comment_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_author uuid;
  v_parent_author uuid;
  v_actor uuid := auth.uid();
  v_body text;
  v_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select cluster_id, author_id into v_cluster, v_author
  from public.posts where id = p_post_id and deleted_at is null;
  if v_cluster is null then raise exception 'post_not_found'; end if;
  if not (public.is_active_member(v_cluster) and public.cluster_unlocked(v_cluster)) then
    raise exception 'posts_locked';
  end if;
  if p_content is null and p_image_url is null and p_gif_url is null then
    raise exception 'empty_comment';
  end if;
  if p_content is not null and (char_length(p_content) < 1 or char_length(p_content) > 1000) then
    raise exception 'content_out_of_range';
  end if;
  if p_image_url is not null and p_gif_url is not null then
    raise exception 'single_media_only';
  end if;
  if p_parent_comment_id is not null and not exists (
    select 1 from public.post_comments
    where id = p_parent_comment_id
      and post_id = p_post_id
      and deleted_at is null
  ) then
    raise exception 'invalid_reply_target';
  end if;

  insert into public.post_comments (post_id, author_id, content, image_url, gif_url, parent_comment_id, cluster_id)
  values (p_post_id, v_actor, p_content, p_image_url, p_gif_url, p_parent_comment_id, v_cluster)
  returning id into v_id;

  insert into public.comment_likes (comment_id, user_id, cluster_id)
  values (v_id, v_actor, v_cluster)
  on conflict do nothing;

  v_body := case
    when p_content is not null and char_length(p_content) > 0 then left(p_content, 100)
    when p_gif_url is not null then '[GIF]'
    when p_image_url is not null then '[Photo]'
    else null
  end;

  if v_author is not null and v_author <> v_actor then
    insert into public.notifications (user_id, type, cluster_id, title, body, payload)
    values (v_author, 'post_comment', v_cluster,
            (select display_name from public.profiles where id = v_actor) || ' replied to your post',
            v_body, jsonb_build_object('post_id', p_post_id));
  end if;

  if p_parent_comment_id is not null then
    select author_id into v_parent_author
    from public.post_comments where id = p_parent_comment_id;
    if v_parent_author is not null and v_parent_author <> v_actor and v_parent_author is distinct from v_author then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      values (v_parent_author, 'post_comment', v_cluster,
              (select display_name from public.profiles where id = v_actor) || ' replied to your comment',
              v_body, jsonb_build_object('post_id', p_post_id));
    end if;
  end if;

  return v_id;
end; $$;

-- start_call: live body is 0110 (both participant inserts).
create or replace function public.start_call(p_cluster_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_status public.cluster_status;
  v_live uuid;
  v_open int;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  if not public.is_account_active(v_me) then raise exception 'account_inactive'; end if;
  if not public.is_active_member(p_cluster_id) then raise exception 'not_member'; end if;

  select status into v_status from public.clusters where id = p_cluster_id;
  if not found then raise exception 'cluster_not_found'; end if;
  if v_status = 'archived' then raise exception 'cluster_archived'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_cluster_id::text, 0));

  update public.calls
  set status = 'ended', ended_at = coalesce(ended_at, now())
  where cluster_id = p_cluster_id and status in ('ringing', 'active') and expires_at <= now();

  update public.call_participants cp
  set left_at = coalesce(cp.left_at, now())
  from public.calls c
  where cp.call_id = c.id and cp.left_at is null and c.status = 'ended'
    and c.cluster_id = p_cluster_id;

  select id into v_live
  from public.calls
  where cluster_id = p_cluster_id and status in ('ringing', 'active')
  order by created_at desc
  limit 1;
  if found then
    select count(*) into v_open
    from public.call_participants
    where call_id = v_live and left_at is null and user_id is distinct from v_me;
    if v_open >= 8 then raise exception 'call_full'; end if;

    insert into public.call_participants (call_id, user_id, cluster_id)
    values (v_live, v_me, p_cluster_id)
    on conflict (call_id, user_id)
    do update set left_at = null, joined_at = now();
    return v_live;
  end if;

  insert into public.calls (cluster_id, initiated_by)
  values (p_cluster_id, v_me)
  returning id into v_live;

  insert into public.call_participants (call_id, user_id, cluster_id)
  values (v_live, v_me, p_cluster_id);

  return v_live;
end; $$;

-- join_call: live body is 0111.
create or replace function public.join_call(p_call_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_cluster uuid;
  v_status text;
  v_expires timestamptz;
  v_initiator uuid;
  v_open int;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  if not public.is_account_active(v_me) then raise exception 'account_inactive'; end if;

  select cluster_id into v_cluster from public.calls where id = p_call_id;
  if not found then raise exception 'call_not_found'; end if;
  if not public.is_active_member(v_cluster) then raise exception 'not_member'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_cluster::text, 0));

  select status, expires_at, initiated_by into v_status, v_expires, v_initiator
  from public.calls where id = p_call_id;
  if not found then raise exception 'call_not_found'; end if;
  if v_status = 'ended' or v_expires <= now() then raise exception 'call_ended'; end if;

  select count(*) into v_open
  from public.call_participants
  where call_id = p_call_id and left_at is null and user_id is distinct from v_me;
  if v_open >= 8 then raise exception 'call_full'; end if;

  insert into public.call_participants (call_id, user_id, cluster_id)
  values (p_call_id, v_me, v_cluster)
  on conflict (call_id, user_id)
  do update set left_at = null, joined_at = now();

  if v_status = 'ringing' and v_me is distinct from v_initiator then
    update public.calls set status = 'active' where id = p_call_id;
  end if;

  return p_call_id;
end; $$;

-- -- 6) Enforce NOT NULL (backfill §2 is FK-total) --------------------------------

alter table public.message_reactions alter column cluster_id set not null;
alter table public.signal_replies alter column cluster_id set not null;
alter table public.post_likes alter column cluster_id set not null;
alter table public.post_comments alter column cluster_id set not null;
alter table public.comment_likes alter column cluster_id set not null;
alter table public.call_participants alter column cluster_id set not null;

-- -- 7) Indexes (PK prefixes already cover message/post/comment lookups) ---------

create index message_reactions_cluster_idx on public.message_reactions (cluster_id);
create index signal_replies_cluster_idx on public.signal_replies (cluster_id);
create index signal_replies_signal_idx on public.signal_replies (signal_id, created_at);
create index post_likes_cluster_idx on public.post_likes (cluster_id);
create index post_comments_cluster_idx on public.post_comments (cluster_id);
create index comment_likes_cluster_idx on public.comment_likes (cluster_id);
create index call_participants_cluster_idx on public.call_participants (cluster_id);

-- -- 8) Full old rows for filtered DELETE/UPDATE subscriptions ------------------
-- Postgres Changes evaluates a subscription filter against the OLD row for
-- DELETEs. With the default replica identity the old record carries only the
-- PK (e.g. message_id/user_id/emoji — no cluster_id), so a
-- `cluster_id=eq.X` filter can never match and DELETEs would silently stop
-- arriving. REPLICA IDENTITY FULL publishes the whole old row, making the
-- filter evaluable. Only the four tables with DELETE/UPDATE subscriptions
-- need it (signal_replies/post_comments are INSERT-only); WAL cost is
-- negligible at these row widths.
alter table public.message_reactions replica identity full;
alter table public.post_likes replica identity full;
alter table public.comment_likes replica identity full;
alter table public.call_participants replica identity full;

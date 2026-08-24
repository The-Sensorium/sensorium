-- 0080_posts_notifications.sql
-- Phase 2 notifications: a comment/reply or a like emits a notification to the
-- post (or reply-target) author. Reads are gated by notification_prefs at
-- read-time (get_my_notifications / get_unread_notification_count via
-- notification_allowed), matching the existing mention model. Follows 0079.

-- -- 1) Preference columns ---------------------------------------------------

alter table public.notification_prefs
  add column post_comment boolean not null default true,
  add column post_like boolean not null default true;

-- -- 2) Pref routing ---------------------------------------------------------

create or replace function public.notification_allowed(
  p_pref public.notification_prefs,
  p_type public.notification_type,
  p_cluster_id uuid
) returns boolean
language sql stable as $$
  select case
    when p_cluster_id is null then true
    when p_pref is null then true
    when p_type = 'message' then p_pref.messages
    when p_type = 'mention' then p_pref.mentions
    when p_type = 'reaction' then p_pref.reactions
    when p_type in ('vote_started', 'vote_result', 'replacement') then p_pref.votes
    when p_type = 'invitation_received' then p_pref.invitations
    when p_type = 'signal_new' then p_pref.signals
    when p_type = 'post_comment' then p_pref.post_comment
    when p_type = 'post_like' then p_pref.post_like
    when p_type = 'moderation_notice' then true
    else true
  end;
$$;

-- -- 3) Emit on comment / reply ---------------------------------------------

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

  insert into public.post_comments (post_id, author_id, content, image_url, gif_url, parent_comment_id)
  values (p_post_id, v_actor, p_content, p_image_url, p_gif_url, p_parent_comment_id)
  returning id into v_id;

  v_body := case
    when p_content is not null and char_length(p_content) > 0 then left(p_content, 100)
    when p_gif_url is not null then '[GIF]'
    when p_image_url is not null then '[Photo]'
    else null
  end;

  -- Notify the post author (not the actor).
  if v_author is not null and v_author <> v_actor then
    insert into public.notifications (user_id, type, cluster_id, title, body, payload)
    values (v_author, 'post_comment', v_cluster,
            (select display_name from public.profiles where id = v_actor) || ' replied to your post',
            v_body, jsonb_build_object('post_id', p_post_id));
  end if;

  -- Notify the author of the comment this replies to, when distinct.
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

-- -- 4) Emit on like ---------------------------------------------------------

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

  select user_id into v_member from public.post_likes
  where post_id = p_post_id and user_id = v_actor;
  if v_member is null then
    insert into public.post_likes (post_id, user_id) values (p_post_id, v_actor);

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

-- 0207_post_comment_mentions.sql
-- Mentions in post comments. A comment can @-mention cluster members using the
-- same word-boundary rule as chat and Signal replies (`is_mentioned` from 0033,
-- plus the `@everyone` broadcast from 0155). Mentioned members get a `mention`
-- notification that deep-links to the exact comment (payload carries `post_id`
-- and `comment_id`), so the existing mention semantics ride along: the
-- per-cluster `mentions` pref, push/email fan-out, and muted-author suppression.
--
-- The `post_comment` notifications (post author, parent-reply author) are
-- skipped for anyone already mentioned, so nobody gets two rows for one comment
-- (mirrors send_message and reply_signal).
--
-- `create_post_comment` live body is 0163. Signature is unchanged, so the
-- grants from 0099 still apply. No new enum values; reuses `mention`.

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
  v_mentions uuid[];
  v_broadcast boolean := false;
  v_author_name text;
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

  -- Mention fan-out (mirrors reply_signal / send_message). Broadcasts reach
  -- every other active member; otherwise match display names by word boundary.
  if p_content is not null then
    v_broadcast := public.is_mentioned_everyone(p_content);

    if v_broadcast then
      select array_agg(distinct cm.user_id) into v_mentions
      from public.cluster_members cm
      where cm.cluster_id = v_cluster
        and cm.left_at is null
        and cm.user_id <> v_actor;
    else
      select array_agg(distinct m.id) into v_mentions
      from public.cluster_members cm
      join public.profiles m on m.id = cm.user_id
      where cm.cluster_id = v_cluster
        and cm.left_at is null
        and m.id <> v_actor
        and public.is_mentioned(p_content, m.display_name);
    end if;

    if v_mentions is not null then
      select display_name into v_author_name
      from public.profiles
      where id = v_actor;

      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select u, 'mention', v_cluster,
             v_author_name || case when v_broadcast then ' mentioned everyone' else ' mentioned you' end,
             null,
             jsonb_build_object('post_id', p_post_id, 'comment_id', v_id)
      from unnest(v_mentions) as u
      where not exists (
        select 1 from public.user_mutes m
        where m.user_id = u and m.muted_user_id = v_actor
      );
    end if;
  end if;

  if v_author is not null and v_author <> v_actor
    and (v_mentions is null or not (v_author = any(v_mentions)))
    and not exists (
      select 1 from public.user_mutes m
      where m.user_id = v_author and m.muted_user_id = v_actor
    ) then
    insert into public.notifications (user_id, type, cluster_id, title, body, payload)
    values (v_author, 'post_comment', v_cluster,
            (select display_name from public.profiles where id = v_actor) || ' replied to your post',
            v_body, jsonb_build_object('post_id', p_post_id, 'comment_id', v_id));
  end if;

  if p_parent_comment_id is not null then
    select author_id into v_parent_author
    from public.post_comments where id = p_parent_comment_id;
    if v_parent_author is not null and v_parent_author <> v_actor and v_parent_author is distinct from v_author
      and (v_mentions is null or not (v_parent_author = any(v_mentions)))
      and not exists (
        select 1 from public.user_mutes m
        where m.user_id = v_parent_author and m.muted_user_id = v_actor
      ) then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      values (v_parent_author, 'post_comment', v_cluster,
              (select display_name from public.profiles where id = v_actor) || ' replied to your comment',
              v_body, jsonb_build_object('post_id', p_post_id, 'comment_id', v_id));
    end if;
  end if;

  return v_id;
end; $$;

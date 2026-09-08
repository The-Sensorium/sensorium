-- 0099_comments_self_like.sql
-- A new comment/reply starts liked by its author so fresh comments never sit at 0 hearts.
-- Mirrors 0098_posts_self_like. Backfills the author's like for existing comments.
-- Self-likes emit no notification (direct insert bypasses toggle_comment_like).

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

  insert into public.comment_likes (comment_id, user_id)
  values (v_id, v_actor)
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

grant execute on function public.create_post_comment(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.create_post_comment(uuid, text, text, text, uuid) to service_role;

insert into public.comment_likes (comment_id, user_id)
select pc.id, pc.author_id
from public.post_comments pc
where pc.deleted_at is null
on conflict do nothing;

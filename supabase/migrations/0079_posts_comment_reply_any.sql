-- 0079_posts_comment_reply_any.sql
-- Instagram-style replies: comments stay a single flat level; a comment can be a
-- reply to ANY other comment on the same post (including another reply), and the
-- UI prefixes the target's @name. The reply target is just a reference; there is
-- no nesting. Relax the earlier "parent must be top-level" guard so any comment
-- can be replied to. Follows 0078.

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
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select cluster_id into v_cluster from public.posts where id = p_post_id and deleted_at is null;
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
  values (p_post_id, auth.uid(), p_content, p_image_url, p_gif_url, p_parent_comment_id)
  returning id into v_id;

  return v_id;
end; $$;

-- Same 5-arg signature, so this create or replace is a plain replacement.
grant execute on function public.create_post_comment(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.create_post_comment(uuid, text, text, text, uuid) to service_role;

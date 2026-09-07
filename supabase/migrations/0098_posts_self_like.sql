-- 0098_posts_self_like.sql
-- A new post starts liked by its author so fresh posts never sit at 0 hearts.
-- Backfills the author's like for existing posts. Self-likes emit no
-- notification (toggle_post_like already guards author <> actor, and this
-- direct insert bypasses that path entirely).

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

  insert into public.post_likes (post_id, user_id)
  values (v_id, auth.uid())
  on conflict do nothing;

  return v_id;
end; $$;

grant execute on function public.create_post(uuid, text, text, text, text) to authenticated;
grant execute on function public.create_post(uuid, text, text, text, text) to service_role;

insert into public.post_likes (post_id, user_id)
select p.id, p.author_id
from public.posts p
where p.deleted_at is null
on conflict do nothing;

-- 0081_posts_title.sql
-- Add an optional post title. A post still requires content and/or media; the
-- title is a nullable label that renders as a heading in the feed/detail.
-- Follows 0080.

alter table public.posts
  add column title text,
  add constraint posts_title_len check (title is null or char_length(title) between 1 and 200);

-- Bump create_post / edit_post signatures (the old arg-count functions must be
-- dropped first, or PostgREST treats the new one as an ambiguous overload -
-- the 0057/0078 lesson).

drop function public.create_post(uuid, text, text, text);

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

  return v_id;
end; $$;

drop function public.edit_post(uuid, text);

create or replace function public.edit_post(
  p_post_id uuid,
  p_content text,
  p_title text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_updated integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if p_content is null or char_length(p_content) < 1 or char_length(p_content) > 2000 then
    raise exception 'content_out_of_range';
  end if;
  if p_title is not null and (char_length(p_title) < 1 or char_length(p_title) > 200) then
    raise exception 'title_out_of_range';
  end if;

  update public.posts
  set content = p_content, title = p_title, edited_at = now()
  where id = p_post_id and author_id = auth.uid() and deleted_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'post_not_editable'; end if;
end; $$;

grant execute on function public.create_post(uuid, text, text, text, text) to authenticated;
grant execute on function public.edit_post(uuid, text, text) to authenticated;
grant execute on function public.create_post(uuid, text, text, text, text) to service_role;
grant execute on function public.edit_post(uuid, text, text) to service_role;

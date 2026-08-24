-- 0085_posts_delete_hides_comments.sql
-- When a post is deleted, also soft-delete its comments so they do not linger as
-- orphans. delete_post already soft-deletes the post row (and only the author's
-- own image); this extends the same treatment to the thread's comments without
-- touching other members' comment media. RLS hides deleted_at is null on read,
-- so the whole thread leaves the feed together. Follows 0084.

create or replace function public.delete_post(p_post_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_updated integer;
  v_image text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select image_url into v_image
  from public.posts where id = p_post_id and author_id = auth.uid() and deleted_at is null;

  update public.posts
  set deleted_at = now()
  where id = p_post_id and author_id = auth.uid() and deleted_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'post_not_deletable'; end if;

  -- Hide the post's comments along with it so the thread has no orphans.
  update public.post_comments
  set deleted_at = now()
  where post_id = p_post_id and deleted_at is null;

  if v_image is not null then
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects o
    where o.bucket_id = 'posts-images' and o.name = v_image;
    perform set_config('storage.allow_delete_query', 'false', true);
  end if;
end; $$;

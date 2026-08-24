-- 0084_posts_comment_delete_thread.sql
-- Deleting a comment now removes its whole reply subtree. create_post_comment
-- only lets a reply target a top-level comment, so the tree is at most one level
-- deep, but we use a recursive CTE so it stays correct if nesting ever changes.
-- The caller may only delete the comment they authored (anchor guard), and that
-- cascade intentionally hides replies authored by other members too. RLS already
-- filters deleted_at is null on read, so soft-deleting the subtree removes it
-- from the feed. Follows 0083. Idempotent via db reset.

create or replace function public.delete_post_comment(p_comment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_updated integer;
  v_images text[];
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  -- Collect the storage paths of every image in the thread so we can purge them.
  with recursive thread as (
    select id, image_url
    from public.post_comments
    where id = p_comment_id and author_id = auth.uid() and deleted_at is null
    union all
    select c.id, c.image_url
    from public.post_comments c
    join thread t on c.parent_comment_id = t.id
  )
  select coalesce(array_agg(image_url) filter (where image_url is not null), '{}')
  into v_images
  from thread;

  -- Soft-delete the comment and every descendant. The anchor guard keeps the
  -- caller unable to delete comments they did not author.
  with recursive thread as (
    select id
    from public.post_comments
    where id = p_comment_id and author_id = auth.uid() and deleted_at is null
    union all
    select c.id
    from public.post_comments c
    join thread t on c.parent_comment_id = t.id
  )
  update public.post_comments
  set deleted_at = now()
  where id in (select id from thread) and deleted_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'comment_not_deletable'; end if;

  if cardinality(v_images) > 0 then
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects o
    where o.bucket_id = 'posts-images' and o.name = any(v_images);
    perform set_config('storage.allow_delete_query', 'false', true);
  end if;
end; $$;

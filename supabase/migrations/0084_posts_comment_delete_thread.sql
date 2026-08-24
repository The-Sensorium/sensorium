-- 0084_posts_comment_delete_thread.sql
-- Deleting a comment removes its whole reply subtree. create_post_comment lets a
-- reply target any comment on the same post (0079), so we walk descendants with
-- a recursive CTE rather than assuming one level. The caller may only delete the
-- comment they authored (anchor guard); that cascade hides replies authored by
-- others too. RLS already filters deleted_at is null on read, so soft-deleting
-- the subtree removes it from the feed. Only the comment's own (owner-uploaded)
-- image is purged from storage; descendant media is left in place so replies are
-- hidden without destroying other members' uploads. Follows 0083.

create or replace function public.delete_post_comment(p_comment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_updated integer;
  v_image text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  -- The caller owns the comment they are deleting; only its own image is purged.
  select image_url into v_image
  from public.post_comments
  where id = p_comment_id and author_id = auth.uid() and deleted_at is null;

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

  if v_image is not null then
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects o
    where o.bucket_id = 'posts-images' and o.name = v_image;
    perform set_config('storage.allow_delete_query', 'false', true);
  end if;
end; $$;

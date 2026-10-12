-- 0195_storage_objects_pagination.sql
-- get_storage_objects_for_account enumerates a user's owned storage objects for
-- the delete-account-storage edge function. PostgREST caps a single
-- set-returning RPC response at 1000 rows and does not honor Range headers for
-- RPC calls in this setup, so an account with more than 1000 objects must page
-- through the list explicitly. The function therefore accepts an OFFSET and a
-- LIMIT (bounded to 1000) and returns a deterministic, deduped (bucket, path)
-- stream ordered by bucket and path, keeping page boundaries stable.
--
-- Grants are preserved by create or replace; omitted parameters fall back to
-- offset 0, limit 1000, so existing callers of the two-arg form keep working.
-- The single-arg signature from 0194 is dropped: create or replace would only
-- add an overload, and PostgREST then cannot resolve a bare { p_user_id } call.

drop function if exists public.get_storage_objects_for_account(uuid);

create or replace function public.get_storage_objects_for_account(
  p_user_id uuid,
  p_offset integer default 0,
  p_limit integer default 1000
)
returns table (bucket text, path text)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if p_user_id is null then return; end if;

  return query
  select distinct t.bucket, t.path
  from (
    select 'avatars'::text as bucket, avatar_url as path
    from public.profiles
    where id = p_user_id and avatar_url is not null
    union all
    select 'chat-images', image_url
    from public.messages
    where author_id = p_user_id and image_url is not null
    union all
    select 'posts-images', image_url
    from public.posts
    where author_id = p_user_id and image_url is not null
    union all
    select 'posts-images', image_url
    from public.post_comments
    where author_id = p_user_id and image_url is not null
  ) as t(bucket, path)
  order by t.bucket, t.path
  limit greatest(least(coalesce(p_limit, 1000), 1000), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end; $function$;

-- The 0194 grant was attached to the dropped (uuid) signature; a fresh create
-- or replace defaults to PUBLIC execute, which would let any user enumerate any
-- account's object list. Re-scope to the service role only.
revoke all on function public.get_storage_objects_for_account(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_storage_objects_for_account(uuid, integer, integer)
  to service_role;
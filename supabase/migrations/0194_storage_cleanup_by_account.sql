-- 0194_storage_cleanup_by_account.sql
-- The client-scoped deletion from 0193 could not reach objects in clusters a
-- user had already left: the chat-images and posts-images delete policies are
-- member-scoped, so the Storage API rejects those removals once membership is
-- gone, orphaning the physical files.
--
-- Deletion moves to a privileged server path (shifted into
-- delete-account-storage): an edge function verifies the caller's JWT, extracts
-- its user id, enumerates that user's owned objects through a service-role-only
-- RPC, and deletes the physical objects through the Storage API with the
-- service-role key, which bypasses RLS and therefore does not depend on cluster
-- membership.
--
-- get_storage_objects_for_account is granted to service_role only so clients
-- can never enumerate an arbitrary user's object list; the edge function calls
-- it with the user id extracted from the caller's own token. The owner-scoped
-- get_my_storage_objects() from 0193 stays for authenticated self-views.

create or replace function public.get_storage_objects_for_account(p_user_id uuid)
returns table (bucket text, path text)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if p_user_id is null then return; end if;

  return query
  select distinct 'avatars'::text as bucket, avatar_url as path
  from public.profiles
  where id = p_user_id and avatar_url is not null
  union all
  select distinct 'chat-images', image_url
  from public.messages
  where author_id = p_user_id and image_url is not null
  union all
  select distinct 'posts-images', image_url
  from public.posts
  where author_id = p_user_id and image_url is not null
  union all
  select distinct 'posts-images', image_url
  from public.post_comments
  where author_id = p_user_id and image_url is not null;
end; $function$;

revoke all on function public.get_storage_objects_for_account(uuid) from public, anon, authenticated;
grant execute on function public.get_storage_objects_for_account(uuid) to service_role;
-- 0193_account_deletion_storage.sql
-- Account deletion previously reclaimed avatars and chat images only: post and
-- comment images in the posts-images bucket were orphaned. Two gaps caused it:
-- the client enforces image deletion through the Storage API, which posts-images
-- offered no delete policy for, so member-scoped `remove` calls were blocked
-- before they could reach the storage service.
--
-- This migration:
--  1) Adds a posts-images delete policy (member-scoped, mirroring
--     chat_images_member_delete from 0050) so the supported Storage API can
--     remove real objects in that bucket.
--  2) Adds get_my_storage_objects(): an author-scoped, security-definer RPC
--     that enumerates every storage object the caller owns (avatar, chat
--     images, post and comment images). The app deletes those through the
--     Storage API before running delete_my_account, while the session still
--     holds the memberships the delete policies require.
--  3) Extends delete_my_account's server-side cleanup (0050/0054 pattern) to
--     also remove posts-images metadata rows, so a direct RPC caller still
--     leaves a consistent storage catalog. Physical file removal stays the
--     Storage API's job; this block only prevents stale metadata rows.
--
-- Moderator records (reports, moderation_actions, account_restrictions) and
-- their documented retention are untouched.

-- -- 1) posts-images delete policy ---------------------------------------------
-- Same member scope as posts_images_member_read/write (0075) and
-- chat_images_member_delete (0050). The deleting user only ever targets paths
-- the author-scoped enumeration below returns, so other members' objects are
-- never part of an account-deletion run.

create policy posts_images_member_delete
  on storage.objects for delete
  using (
    bucket_id = 'posts-images'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );

-- -- 2) Author-scoped storage enumeration --------------------------------------
-- Returns the exact storage objects owned by the caller across every private
-- bucket. Security definer so hidden/deleted rows (moderation_status
-- rejected, deleted_at set) still surface their media for reclamation; the
-- member-scoped delete policies above are membership-based, not row-based, so
-- those objects remain removable.

create or replace function public.get_my_storage_objects()
returns table (bucket text, path text)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  return query
  select distinct 'avatars'::text as bucket, avatar_url as path
  from public.profiles
  where id = auth.uid() and avatar_url is not null
  union all
  select distinct 'chat-images', image_url
  from public.messages
  where author_id = auth.uid() and image_url is not null
  union all
  select distinct 'posts-images', image_url
  from public.posts
  where author_id = auth.uid() and image_url is not null
  union all
  select distinct 'posts-images', image_url
  from public.post_comments
  where author_id = auth.uid() and image_url is not null;
end; $function$;

revoke all on function public.get_my_storage_objects() from public, anon;
grant execute on function public.get_my_storage_objects() to authenticated;

-- -- 3) delete_my_account posts-images parity ----------------------------------
-- Live body is 0054. Changes: the posts-images reclaim block and its comment.
-- Moderation retention, last-admin guard, and member departures are unchanged.

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_cluster record;
  v_leaver_name text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  -- Last active admin cannot delete the account (would leave zero admins).
  if exists (
    select 1 from public.user_roles
    where user_id = v_user_id and role = 'admin' and revoked_at is null
  ) and not exists (
    select 1 from public.user_roles
    where role = 'admin' and revoked_at is null and user_id <> v_user_id
  ) then
    raise exception 'last_admin_required';
  end if;

  -- Stamp role history as revoked so the partial unique index does not leave a
  -- dangling "active" assignment once the profile row is gone (on delete set null).
  update public.user_roles
  set revoked_at = now(), revoked_by = v_user_id
  where user_id = v_user_id and revoked_at is null;

  -- Reclaim storage metadata server-side, independent of account status /
  -- membership. The app deletes the physical objects up front through the
  -- Storage API (get_my_storage_objects); this block just keeps the catalog
  -- consistent for callers that skip that flow. storage.protect_objects_delete
  -- blocks direct deletes unless the storage.allow_delete_query GUC is set;
  -- isolate it to this transaction.
  perform set_config('storage.allow_delete_query', 'true', true);

  delete from storage.objects o
  using public.messages m
  where o.bucket_id = 'chat-images'
    and o.name = m.image_url
    and m.author_id = v_user_id
    and m.image_url is not null;

  delete from storage.objects o
  using public.posts p
  where o.bucket_id = 'posts-images'
    and o.name = p.image_url
    and p.author_id = v_user_id
    and p.image_url is not null;

  delete from storage.objects o
  using public.post_comments pc
  where o.bucket_id = 'posts-images'
    and o.name = pc.image_url
    and pc.author_id = v_user_id
    and pc.image_url is not null;

  delete from storage.objects o
  using public.profiles p
  where o.bucket_id = 'avatars'
    and o.name = p.avatar_url
    and p.id = v_user_id
    and p.avatar_url is not null;

  perform set_config('storage.allow_delete_query', 'false', true);

  select display_name into v_leaver_name
  from public.profiles where id = v_user_id;

  for v_cluster in
    select distinct cm.cluster_id
    from public.cluster_members cm
    where cm.user_id = v_user_id and cm.left_at is null
  loop
    update public.cluster_members set left_at = now()
    where cluster_id = v_cluster.cluster_id and user_id = v_user_id;

    insert into public.notifications (user_id, type, cluster_id, title, body)
    select cm.user_id, 'replacement', v_cluster.cluster_id,
           coalesce(v_leaver_name, 'A member') || ' left the cluster',
           'A spot just opened - we are finding a new member to fill it.'
    from public.cluster_members cm
    where cm.cluster_id = v_cluster.cluster_id and cm.left_at is null;

    perform public.start_replacement(v_cluster.cluster_id);
  end loop;

  delete from auth.users where id = v_user_id;
end; $$;
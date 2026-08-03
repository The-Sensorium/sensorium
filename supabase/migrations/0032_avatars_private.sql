-- 0032_avatars_private.sql
-- Make the `avatars` bucket private and require an authenticated session to
-- read profile photos. Previously the bucket was public with an anon SELECT
-- policy, which let logged-out users enumerate the bucket and download any
-- avatar. The client now serves avatars through short-lived signed URLs
-- (useAvatarUrl) instead of getPublicUrl.

update storage.buckets set public = false where name = 'avatars';

drop policy if exists "avatars public read" on storage.objects;

create policy avatars_member_read
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
  );

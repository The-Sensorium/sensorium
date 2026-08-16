-- 0050_storage_object_gc.sql
-- Give the browser the ability to DELETE storage objects so superseded files can
-- actually be collected. Until now avatars and chat-images had INSERT/SELECT
-- policies only, so a replacement/removal/send-failure/soft-delete never cleaned
-- up the underlying object — every avatar change, message delete, and failed
-- image send left an unreachable file behind.
--
-- Delete stays scoped exactly like the existing write access:
--   * avatars    — any authenticated user may delete files in their own folder.
--   * chat-images — any active member of the owning cluster may delete files in
--     its folder (same shape as chat_images_member_write from 0021); the client
--     uses this to reclaim a send that failed after upload and to drop the image
--     of a soft-deleted message.

create policy avatars_owner_delete
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy chat_images_member_delete
  on storage.objects for delete
  using (
    bucket_id = 'chat-images'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );
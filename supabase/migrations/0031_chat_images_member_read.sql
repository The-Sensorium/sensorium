-- 0031_chat_images_member_read.sql
-- With the `chat-images` bucket now private (0030), the client needs signed
-- URLs (createSignedUrl) to load chat images. Signing requires SELECT access on
-- the storage.objects row, which no policy granted. Restrict reads to active
-- members of the owning cluster (the storage path's first segment = cluster id),
-- keeping media private from anyone who is not a member.

create policy chat_images_member_read
  on storage.objects for select
  using (
    bucket_id = 'chat-images'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );
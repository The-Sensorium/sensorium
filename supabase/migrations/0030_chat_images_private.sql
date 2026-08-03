-- 0030_chat_images_private.sql
-- Make the `chat-images` bucket private so chat media is not readable by
-- anyone with the URL. The client now uses short-lived signed URLs
-- (createSignedUrl) instead of getPublicUrl. Requires the client change in
-- src/features/cluster.ts (useChatImageUrl) to keep chat images loading.

update storage.buckets set public = false where name = 'chat-images';
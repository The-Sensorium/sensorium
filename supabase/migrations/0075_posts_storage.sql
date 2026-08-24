-- 0075_posts_storage.sql
-- Private bucket for post/comment images, mirroring the chat-images lifecycle
-- (0021/0030/0031). GIFs are remote KLIPY URLs and need no storage. Follows 0074.
-- The object path's first segment is the cluster id (same convention as
-- chat-images), so reads/writes are gated to the owning cluster via `is_active_member`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'posts-images',
  'posts-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy posts_images_member_write
  on storage.objects for insert
  with check (
    bucket_id = 'posts-images'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );

create policy posts_images_member_update
  on storage.objects for update
  using (
    bucket_id = 'posts-images'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );

create policy posts_images_member_read
  on storage.objects for select
  using (
    bucket_id = 'posts-images'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );

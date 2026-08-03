-- 0016 — Storage: avatars bucket (profile photos)
-- chat-images bucket ships with Milestone 6 (chat).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Public read; writes restricted to the owner's own folder (avatars/{userId}/...)
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

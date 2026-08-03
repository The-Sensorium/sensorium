-- 0021 - Realtime: Postgres Changes publication + chat-images bucket
-- Milestone 8 (Realtime Chat). Follows 0020. Idempotent via db reset.

-- Enable Postgres Changes on the tables the realtime milestones consume (docs 04 §1).
-- The realtime server derives its replication publication from the `realtime.subscription`
-- registry; the old `alter publication` alone does not make events flow on local dev.
alter publication supabase_realtime add table
  public.messages,
  public.message_reactions,
  public.moods,
  public.signals,
  public.signal_replies,
  public.cluster_members,
  public.clusters,
  public.notifications,
  public.invitations;

insert into realtime.subscription (subscription_id, entity, claims)
select gen_random_uuid(), t.e::regclass, jsonb_build_object('role', 'authenticated')
from unnest(array[
  'messages',
  'message_reactions',
  'moods',
  'signals',
  'signal_replies',
  'cluster_members',
  'clusters',
  'notifications',
  'invitations'
]) as t(e);

-- chat-images: public-read bucket (doc-recommended pragmatic choice for MVP) with
-- unguessable UUID object names. Uploads are gated to active cluster members via
-- storage RLS (the storage path's first segment is the cluster id).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy chat_images_member_write
  on storage.objects for insert
  with check (
    bucket_id = 'chat-images'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );

create policy chat_images_member_update
  on storage.objects for update
  using (
    bucket_id = 'chat-images'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );

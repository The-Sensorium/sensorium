-- 006_moods_status.sql

create table public.moods (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  mood public.mood not null,
  created_at timestamptz not null default now()
);

create index moods_lookup on public.moods (user_id, cluster_id, created_at desc);

alter table public.moods enable row level security;

create policy "moods read own cluster"
  on public.moods for select
  using (public.is_active_member(cluster_id));
create policy "moods insert self"
  on public.moods for insert
  with check (auth.uid() = user_id and public.is_active_member(cluster_id));

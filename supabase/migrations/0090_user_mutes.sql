-- 0090_user_mutes.sql
-- Personal mute list: hiding someone's content for the muter only.
-- Global per user (not per cluster). Client-side filter; membership, votes,
-- and moderation are unchanged. A muted user is never told.

create table public.user_mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id),
  constraint user_mutes_no_self check (user_id <> muted_user_id)
);

create index user_mutes_user_idx on public.user_mutes (user_id);

alter table public.user_mutes enable row level security;

create policy "mutes own read"
  on public.user_mutes for select
  using (auth.uid() = user_id);

create policy "mutes own insert"
  on public.user_mutes for insert
  with check (
    auth.uid() = user_id
    and public.is_account_active(auth.uid())
  );

create policy "mutes own delete"
  on public.user_mutes for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.user_mutes to authenticated;

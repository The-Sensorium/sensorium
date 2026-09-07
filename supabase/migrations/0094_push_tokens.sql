-- 0094_push_tokens.sql
-- Expo Push tokens for mobile clients. The app registers its ExpoPushToken on
-- sign-in and removes it on sign-out; a future outbox worker can fan
-- notifications out to these tokens via the Expo Push API. Tokens carry no
-- message content and are owner-scoped like user_mutes.

create table public.push_tokens (
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, expo_push_token)
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy "push tokens own read"
  on public.push_tokens for select
  using (auth.uid() = user_id);

create policy "push tokens own insert"
  on public.push_tokens for insert
  with check (
    auth.uid() = user_id
    and public.is_account_active(auth.uid())
  );

create policy "push tokens own delete"
  on public.push_tokens for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.push_tokens to authenticated;

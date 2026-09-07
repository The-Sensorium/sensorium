-- 0097_push_tokens_upsert.sql
-- Token refresh upserts (user_id, expo_push_token) with a new updated_at, but
-- 0094 granted no UPDATE: the refresh silently failed RLS. Add the owner
-- update policy plus a trigger, drop the redundant index (the PK already
-- covers user_id lookups), and grant the future outbox worker (service_role)
-- full access.

create or replace function public.touch_push_tokens_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger push_tokens_updated_at
  before update on public.push_tokens
  for each row execute function public.touch_push_tokens_updated_at();

create policy "push tokens own update"
  on public.push_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop index if exists public.push_tokens_user_idx;

grant select, insert, update, delete on public.push_tokens to authenticated;
grant all on public.push_tokens to service_role;

-- 0130_push_token_single_owner.sql
-- Same Expo token registered to several user_ids (one device signing in as
-- several accounts) fans every notification out to that device once per owner
-- row: 1 notification row, N pushes. The mobile unregister ran after sign-out
-- when auth.uid() is null, so the RLS delete never matched and orphans
-- accumulated. Direct upserts also cannot remove another user's row.
--
-- Fix: single-owner tokens. register steals the token from other owners,
-- unregister removes the caller's row while still authenticated. A trigger
-- enforces the steal on the legacy direct-write path too, and a deferred
-- unique constraint rejects a concurrent double-register at commit instead
-- of re-creating duplicates. Backfill keeps the most recently active owner
-- per token.

create or replace function public.register_push_token(p_expo_push_token text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  if p_expo_push_token is null or btrim(p_expo_push_token) = '' then
    raise exception 'token required';
  end if;
  if not public.is_account_active(v_user_id) then raise exception 'account inactive'; end if;

  delete from public.push_tokens
  where expo_push_token = p_expo_push_token and user_id <> v_user_id;

  insert into public.push_tokens (user_id, expo_push_token, updated_at)
  values (v_user_id, p_expo_push_token, now())
  on conflict (user_id, expo_push_token)
  do update set updated_at = now();
end; $$;

create or replace function public.unregister_push_token(p_expo_push_token text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  if p_expo_push_token is null or btrim(p_expo_push_token) = '' then
    raise exception 'token required';
  end if;
  delete from public.push_tokens
  where user_id = v_user_id and expo_push_token = p_expo_push_token;
end; $$;

revoke all on function public.register_push_token(text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;
grant execute on function public.register_push_token(text) to service_role;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.unregister_push_token(text) to service_role;

delete from public.push_tokens a
using public.push_tokens b
where a.expo_push_token = b.expo_push_token
  and a.user_id <> b.user_id
  and (a.updated_at, a.user_id) < (b.updated_at, b.user_id);

create or replace function public.steal_push_token_on_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_tokens
  where expo_push_token = NEW.expo_push_token and user_id <> NEW.user_id;
  return NEW;
end; $$;

drop trigger if exists push_tokens_single_owner on public.push_tokens;
create trigger push_tokens_single_owner
  after insert or update on public.push_tokens
  for each row execute function public.steal_push_token_on_insert();

alter table public.push_tokens
  add constraint push_tokens_token_unique unique (expo_push_token)
  deferrable initially deferred;

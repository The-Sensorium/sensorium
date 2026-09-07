-- 0096_delete_message_idempotent.sql
-- Retry-safe delete_message: a retry after a successful delete (double tap,
-- network replay) must succeed, not raise message_not_found. Also qualifies
-- the UPDATE with the author so the check and the write can't drift apart.

create or replace function public.delete_message(p_message_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_image text;
  v_deleted_at timestamptz;
begin
  select author_id, image_url, deleted_at into v_author, v_image, v_deleted_at
  from public.messages
  where id = p_message_id;

  if not found then raise exception 'message_not_found'; end if;
  if v_author is distinct from auth.uid() then raise exception 'not_author'; end if;
  if not public.is_account_active(auth.uid()) then raise exception 'account_inactive'; end if;

  if v_deleted_at is not null then
    return v_image;
  end if;

  update public.messages
  set deleted_at = now()
  where id = p_message_id
    and author_id = auth.uid()
    and deleted_at is null;

  return v_image;
end; $$;

revoke all on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.delete_message(uuid) to service_role;

-- 0095_delete_message_rpc.sql
-- Soft-delete own message via RPC. A direct UPDATE fails even for the author:
-- PostgREST always requests RETURNING, and the SELECT policy hides rows with
-- deleted_at set, so the returned row violates RLS. The RPC performs the
-- update as security definer after the same checks and returns the image path
-- so the client can reclaim the storage object.

create or replace function public.delete_message(p_message_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_image text;
begin
  select author_id, image_url into v_author, v_image
  from public.messages
  where id = p_message_id and deleted_at is null;

  if not found then raise exception 'message_not_found'; end if;
  if v_author is distinct from auth.uid() then raise exception 'not_author'; end if;
  if not public.is_account_active(auth.uid()) then raise exception 'account_inactive'; end if;

  update public.messages set deleted_at = now() where id = p_message_id;

  return v_image;
end; $$;

revoke all on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.delete_message(uuid) to service_role;

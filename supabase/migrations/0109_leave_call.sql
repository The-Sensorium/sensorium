-- 0109_leave_call.sql
-- Leaving a call removes only the caller from it; the call stays live for the
-- others. When the last open participant leaves, the call is ended (so the
-- cluster's "live call" banner clears and a fresh call can start). Follows 0108.

create or replace function public.leave_call(p_call_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_cluster uuid;
  v_open int;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;

  select cluster_id into v_cluster from public.calls where id = p_call_id;
  if not found then raise exception 'call_not_found'; end if;
  if not public.is_active_member(v_cluster) then raise exception 'not_member'; end if;

  update public.call_participants
  set left_at = coalesce(left_at, now())
  where call_id = p_call_id and user_id = v_me and left_at is null;

  select count(*) into v_open
  from public.call_participants
  where call_id = p_call_id and left_at is null;

  if v_open = 0 then
    update public.calls
    set status = 'ended', ended_at = coalesce(ended_at, now())
    where id = p_call_id and status <> 'ended';
  end if;
end; $$;

revoke all on function public.leave_call(uuid) from public, anon;
grant execute on function public.leave_call(uuid) to authenticated;
grant execute on function public.leave_call(uuid) to service_role;

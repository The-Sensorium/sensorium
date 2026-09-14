-- 0111_calls_membership_cleanup.sql
-- Close the gaps found in review:
--   1. Leaving a cluster (or deleting/banning) while in a call must release the
--      member's call participant row and end a call that becomes empty.
--   2. join_call must re-check status/expiry after taking the per-cluster lock so
--      it can't race leave_call into an ended call with an open participant.
--   3. leave_call takes the same lock so join and leave serialize.
-- Also grants is_account_active to service_role for the token function.
-- Follows 0110.

-- -- 1) Release call seats when a member departs any cluster -------------------

create or replace function public.release_member_calls()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.left_at is null and new.left_at is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.cluster_id::text, 0));

    update public.call_participants cp
    set left_at = now()
    from public.calls c
    where cp.call_id = c.id
      and c.cluster_id = new.cluster_id
      and cp.user_id = new.user_id
      and cp.left_at is null
      and c.status in ('ringing', 'active');

    update public.calls c
    set status = 'ended', ended_at = coalesce(c.ended_at, now())
    where c.cluster_id = new.cluster_id
      and c.status in ('ringing', 'active')
      and not exists (
        select 1 from public.call_participants cp
        where cp.call_id = c.id and cp.left_at is null
      );
  end if;
  return new;
end; $$;

drop trigger if exists cluster_members_release_calls on public.cluster_members;
create trigger cluster_members_release_calls
after update on public.cluster_members
for each row execute function public.release_member_calls();

-- -- 2) leave_call takes the per-cluster lock ---------------------------------

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

  perform pg_advisory_xact_lock(hashtextextended(v_cluster::text, 0));

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

-- -- 3) join_call re-checks status/expiry under the lock ----------------------

create or replace function public.join_call(p_call_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_cluster uuid;
  v_status text;
  v_expires timestamptz;
  v_initiator uuid;
  v_open int;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  if not public.is_account_active(v_me) then raise exception 'account_inactive'; end if;

  select cluster_id into v_cluster from public.calls where id = p_call_id;
  if not found then raise exception 'call_not_found'; end if;
  if not public.is_active_member(v_cluster) then raise exception 'not_member'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_cluster::text, 0));

  -- Re-read under the lock: a concurrent leave_call/start_call may have ended it.
  select status, expires_at, initiated_by into v_status, v_expires, v_initiator
  from public.calls where id = p_call_id;
  if not found then raise exception 'call_not_found'; end if;
  if v_status = 'ended' or v_expires <= now() then raise exception 'call_ended'; end if;

  select count(*) into v_open
  from public.call_participants
  where call_id = p_call_id and left_at is null and user_id is distinct from v_me;
  if v_open >= 8 then raise exception 'call_full'; end if;

  insert into public.call_participants (call_id, user_id)
  values (p_call_id, v_me)
  on conflict (call_id, user_id)
  do update set left_at = null, joined_at = now();

  if v_status = 'ringing' and v_me is distinct from v_initiator then
    update public.calls set status = 'active' where id = p_call_id;
  end if;

  return p_call_id;
end; $$;

revoke all on function public.join_call(uuid) from public, anon;
grant execute on function public.join_call(uuid) to authenticated;
grant execute on function public.join_call(uuid) to service_role;

-- -- 4) Grants ----------------------------------------------------------------

grant execute on function public.is_account_active(uuid) to service_role;

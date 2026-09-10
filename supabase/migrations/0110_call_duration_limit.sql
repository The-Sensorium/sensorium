-- 0110_call_duration_limit.sql
-- Cap calls at 30 minutes so beta usage can't quietly burn the LiveKit free
-- tier (and stranded calls get cleaned up). `expires_at` is on the call row;
-- a pg_cron tick ends anything past it, and the client shows the remaining
-- time and leaves when it hits zero. Follows 0109.

alter table public.calls
  add column expires_at timestamptz not null default (now() + interval '30 minutes');

create index calls_expiry_idx
  on public.calls (expires_at)
  where (status in ('ringing', 'active'));

-- End expired live calls and release their participants. Called by pg_cron.
create or replace function public.end_expired_calls()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.calls
  set status = 'ended', ended_at = coalesce(ended_at, now())
  where status in ('ringing', 'active') and expires_at <= now();

  update public.call_participants cp
  set left_at = coalesce(cp.left_at, now())
  from public.calls c
  where cp.call_id = c.id and cp.left_at is null and c.status = 'ended';
end; $$;

revoke execute on function public.end_expired_calls() from public, anon, authenticated;
grant execute on function public.end_expired_calls() to service_role;

-- Idempotent scheduling (0039 pattern): each named job exists exactly once.
select cron.unschedule('call-expire')
where exists (select 1 from cron.job where jobname = 'call-expire');
select cron.schedule('call-expire', '* * * * *', $$select public.end_expired_calls()$$);

-- start_call must treat an expired-but-not-yet-cron-ended call as gone, so a
-- cluster never has two live calls.
create or replace function public.start_call(p_cluster_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_status public.cluster_status;
  v_live uuid;
  v_open int;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  if not public.is_account_active(v_me) then raise exception 'account_inactive'; end if;
  if not public.is_active_member(p_cluster_id) then raise exception 'not_member'; end if;

  select status into v_status from public.clusters where id = p_cluster_id;
  if not found then raise exception 'cluster_not_found'; end if;
  if v_status = 'archived' then raise exception 'cluster_archived'; end if;

  -- Serialize start/join per cluster so the single-live-call invariant and the
  -- participant cap hold under concurrent taps.
  perform pg_advisory_xact_lock(hashtextextended(p_cluster_id::text, 0));

  -- Close any live-but-expired call first (cron may not have ticked yet).
  update public.calls
  set status = 'ended', ended_at = coalesce(ended_at, now())
  where cluster_id = p_cluster_id and status in ('ringing', 'active') and expires_at <= now();

  update public.call_participants cp
  set left_at = coalesce(cp.left_at, now())
  from public.calls c
  where cp.call_id = c.id and cp.left_at is null and c.status = 'ended'
    and c.cluster_id = p_cluster_id;

  select id into v_live
  from public.calls
  where cluster_id = p_cluster_id and status in ('ringing', 'active')
  order by created_at desc
  limit 1;
  if found then
    select count(*) into v_open
    from public.call_participants
    where call_id = v_live and left_at is null and user_id is distinct from v_me;
    if v_open >= 8 then raise exception 'call_full'; end if;

    insert into public.call_participants (call_id, user_id)
    values (v_live, v_me)
    on conflict (call_id, user_id)
    do update set left_at = null, joined_at = now();
    return v_live;
  end if;

  insert into public.calls (cluster_id, initiated_by)
  values (p_cluster_id, v_me)
  returning id into v_live;

  insert into public.call_participants (call_id, user_id)
  values (v_live, v_me);

  return v_live;
end; $$;

revoke all on function public.start_call(uuid) from public, anon;
grant execute on function public.start_call(uuid) to authenticated;
grant execute on function public.start_call(uuid) to service_role;

-- join_call rejects an expired call even in the one-minute window before cron.
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

  select cluster_id, status, expires_at, initiated_by into v_cluster, v_status, v_expires, v_initiator
  from public.calls where id = p_call_id;
  if not found then raise exception 'call_not_found'; end if;
  if v_status = 'ended' or v_expires <= now() then raise exception 'call_ended'; end if;
  if not public.is_active_member(v_cluster) then raise exception 'not_member'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_cluster::text, 0));

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

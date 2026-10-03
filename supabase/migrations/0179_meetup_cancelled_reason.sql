-- 0179_meetup_cancelled_reason.sql
-- A cancelled meetup is either quorum-less expiry or a creator withdrawal,
-- but both wrote status='cancelled' with no distinction, so withdrawn
-- proposals permanently wore a false "fewer than 3 voted" banner. Record
-- the reason at write time; clients show the expired copy only for genuine
-- expiry (pre-0179 rows keep null and render as expired, as before).

alter table public.meetups
  add column cancelled_reason text check (cancelled_reason in ('expired', 'withdrawn'));

create or replace function public.cancel_meetup(p_meetup_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_meetup record;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  perform public.assert_account_can_write();

  select * into v_meetup from public.meetups where id = p_meetup_id for update;
  if not found then raise exception 'meetup_not_found'; end if;
  if not public.is_active_member(v_meetup.cluster_id) then raise exception 'not_member'; end if;
  if v_meetup.created_by is distinct from v_me then raise exception 'not_creator'; end if;
  if v_meetup.status not in ('proposed', 'voting') then
    raise exception 'cannot_cancel';
  end if;

  update public.meetups
  set status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now()),
      cancelled_reason = 'withdrawn'
  where id = p_meetup_id;
end; $$;

revoke all on function public.cancel_meetup(uuid) from public, anon;
grant execute on function public.cancel_meetup(uuid) to authenticated;
grant execute on function public.cancel_meetup(uuid) to service_role;

create or replace function public.expire_meetups()
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('meetup-expire'));
  perform set_config('statement_timeout', '120s', true);

  update public.meetups
  set status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now()),
      cancelled_reason = 'expired'
  where status = 'voting' and voting_closes_at < now();

  update public.meetups
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where status in ('confirmed', 'starting', 'active')
    and ends_at is not null
    and ends_at < now() - interval '2 hours';
end; $$;

revoke execute on function public.expire_meetups() from public, anon, authenticated;
grant execute on function public.expire_meetups() to service_role;

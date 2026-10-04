-- 0185_meetup_expire_at_end.sql
-- Complete confirmed meetups as soon as ends_at passes instead of two hours
-- later. The 2h tail kept a dead "meetup is set" card with no actions on
-- screen long after the call window closed, and blocked proposing next week
-- (meetup_active) until the cron caught up. Clients already read a meetup as
-- finished past ends_at, so the next expire_meetups tick (every 5m) now flips
-- the row and unlocks proposing within minutes of the scheduled end.
-- Completion waits while a cluster call is still live: ending the row
-- mid-call would unmount the in-call UI (via realtime invalidation) and drop
-- members from LiveKit, so a lingering conversation holds the meetup open
-- until the next expire_meetups tick after the last hang-up (leave_call ends
-- the call row promptly, and end_expired_calls bounds it at the call duration
-- limit regardless). Only joinable calls hold: rows past their own expires_at
-- are already dead to start_call/join_call and must not block expiry.
-- Any live cluster call holds, not just the meetup call; a single live call
-- per cluster is the invariant, so this is the same thing in practice.

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

  update public.meetups as m
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where m.status in ('confirmed', 'starting', 'active')
    and m.ends_at is not null
    and m.ends_at < now()
    and not exists (
      select 1 from public.calls as c
      where c.cluster_id = m.cluster_id
        and c.status in ('ringing', 'active')
        and c.expires_at > now()
    );
end; $$;

revoke execute on function public.expire_meetups() from public, anon, authenticated;
grant execute on function public.expire_meetups() to service_role;

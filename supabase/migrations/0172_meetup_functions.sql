-- 0172_meetup_functions.sql
-- Privileged Cluster Meetup transitions. Clients have no write access to the
-- meetup tables; every mutation goes through these security definer functions
-- so membership, account state, quorum, and the single-active-meetup invariant
-- hold atomically. Follows the 0108 call RPC and 0159 vote close patterns.
--
-- Quorum is fixed at 3 confirmed participants on one slot for v1. The first
-- slot to reach 3 confirms inline in the voting transaction under the cluster
-- advisory lock. Ties cannot occur inline; the expiry path never confirms.

-- Fixed quorum for v1 meetups. Kept as a function so clients and tests read
-- the same constant as the RPC layer.
create or replace function public.meetup_quorum()
returns int
language sql immutable as $$
  select 3;
$$;

revoke all on function public.meetup_quorum() from public, anon;
grant execute on function public.meetup_quorum() to authenticated;
grant execute on function public.meetup_quorum() to service_role;

create or replace function public.create_meetup(
  p_cluster_id uuid,
  p_slots jsonb,
  p_voting_closes_at timestamptz,
  p_week_label text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_status public.cluster_status;
  v_meetup_id uuid;
  v_slot jsonb;
  v_starts timestamptz;
  v_ends timestamptz;
  v_min_starts timestamptz;
  v_count int;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  perform public.assert_account_can_write();
  if not public.is_active_member(p_cluster_id) then raise exception 'not_member'; end if;

  select status into v_status from public.clusters where id = p_cluster_id;
  if not found then raise exception 'cluster_not_found'; end if;
  if v_status <> 'active' then raise exception 'cluster_not_ready'; end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'invalid_slots';
  end if;
  v_count := jsonb_array_length(p_slots);
  if v_count < 2 or v_count > 4 then raise exception 'invalid_slots'; end if;

  if p_voting_closes_at is null or p_voting_closes_at <= now() then
    raise exception 'invalid_voting_window';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_cluster_id::text, 0));

  if exists (
    select 1 from public.meetups
    where cluster_id = p_cluster_id
      and status in ('proposed', 'voting', 'confirmed', 'starting', 'active')
  ) then
    raise exception 'meetup_active';
  end if;

  perform public.check_rate_limit('meetup', 5, interval '1 day');

  v_min_starts := null;
  for v_slot in select * from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(v_slot) <> 'object' then raise exception 'invalid_slots'; end if;
    begin
      v_starts := (v_slot ->> 'starts_at')::timestamptz;
      v_ends := (v_slot ->> 'ends_at')::timestamptz;
    exception when others then
      raise exception 'invalid_slots';
    end;
    if v_starts is null or v_ends is null then raise exception 'invalid_slots'; end if;
    if v_starts <= now() then raise exception 'slot_in_past'; end if;
    if v_ends <= v_starts then raise exception 'invalid_slots'; end if;
    if v_min_starts is null or v_starts < v_min_starts then
      v_min_starts := v_starts;
    end if;
  end loop;

  if p_voting_closes_at >= v_min_starts then
    raise exception 'invalid_voting_window';
  end if;

  insert into public.meetups (cluster_id, created_by, status, voting_closes_at, week_label)
  values (p_cluster_id, v_me, 'voting', p_voting_closes_at, nullif(btrim(coalesce(p_week_label, '')), ''))
  returning id into v_meetup_id;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    v_starts := (v_slot ->> 'starts_at')::timestamptz;
    v_ends := (v_slot ->> 'ends_at')::timestamptz;
    insert into public.meetup_slots (meetup_id, starts_at, ends_at, created_by)
    values (v_meetup_id, v_starts, v_ends, v_me);
  end loop;

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select cm.user_id, 'meetup_invite', p_cluster_id,
         'Vote for this week Cluster Meetup',
         'Pick a time for a casual group call.',
         jsonb_build_object('meetup_id', v_meetup_id)
  from public.cluster_members cm
  where cm.cluster_id = p_cluster_id
    and cm.left_at is null
    and cm.user_id is distinct from v_me;

  return v_meetup_id;
end; $$;

revoke all on function public.create_meetup(uuid, jsonb, timestamptz, text) from public, anon;
grant execute on function public.create_meetup(uuid, jsonb, timestamptz, text) to authenticated;
grant execute on function public.create_meetup(uuid, jsonb, timestamptz, text) to service_role;

create or replace function public.vote_meetup_slot(p_meetup_id uuid, p_slot_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_meetup record;
  v_count int;
  v_winner uuid;
  v_starts timestamptz;
  v_ends timestamptz;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  perform public.assert_account_can_write();

  select * into v_meetup from public.meetups where id = p_meetup_id for update;
  if not found then raise exception 'meetup_not_found'; end if;
  if not public.is_active_member(v_meetup.cluster_id) then raise exception 'not_member'; end if;
  if v_meetup.status <> 'voting' then raise exception 'voting_closed'; end if;
  if v_meetup.voting_closes_at <= now() then raise exception 'voting_closed'; end if;

  if not exists (
    select 1 from public.meetup_slots
    where id = p_slot_id and meetup_id = p_meetup_id
  ) then
    raise exception 'invalid_slot';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_meetup.cluster_id::text, 0));

  -- Re-read under the cluster lock so a concurrent confirm is observed.
  select * into v_meetup from public.meetups where id = p_meetup_id for update;
  if v_meetup.status <> 'voting' then raise exception 'voting_closed'; end if;

  perform public.check_rate_limit('meetup_vote', 20, interval '1 hour');

  insert into public.meetup_votes (meetup_id, slot_id, user_id)
  values (p_meetup_id, p_slot_id, v_me)
  on conflict (meetup_id, user_id)
  do update set slot_id = excluded.slot_id, created_at = now();

  -- First slot to reach quorum wins. Tiebreak is deterministic by slot time
  -- then id, and confirmation happens inline so only one transaction wins.
  select s.id, s.starts_at, s.ends_at into v_winner, v_starts, v_ends
  from public.meetup_slots s
  left join public.meetup_votes v on v.slot_id = s.id
  where s.meetup_id = p_meetup_id
  group by s.id, s.starts_at, s.ends_at
  having count(v.user_id) >= public.meetup_quorum()
  order by s.starts_at asc, s.id asc
  limit 1;

  if v_winner is not null then
    select count(*) into v_count
    from public.meetup_votes where meetup_id = p_meetup_id;

    update public.meetups
    set status = 'confirmed',
        confirmed_slot_id = v_winner,
        starts_at = v_starts,
        ends_at = v_ends
    where id = p_meetup_id and status = 'voting';

    if found then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select cm.user_id, 'meetup_confirmed', v_meetup.cluster_id,
             'Your Cluster Meetup is set',
             'Join the group call.',
             jsonb_build_object('meetup_id', p_meetup_id)
      from public.cluster_members cm
      where cm.cluster_id = v_meetup.cluster_id
        and cm.left_at is null;
    end if;
  end if;
end; $$;

revoke all on function public.vote_meetup_slot(uuid, uuid) from public, anon;
grant execute on function public.vote_meetup_slot(uuid, uuid) to authenticated;
grant execute on function public.vote_meetup_slot(uuid, uuid) to service_role;

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
  if v_meetup.status not in ('proposed', 'voting', 'confirmed', 'starting') then
    raise exception 'cannot_cancel';
  end if;

  update public.meetups
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now())
  where id = p_meetup_id;
end; $$;

revoke all on function public.cancel_meetup(uuid) from public, anon;
grant execute on function public.cancel_meetup(uuid) to authenticated;
grant execute on function public.cancel_meetup(uuid) to service_role;

create or replace function public.rsvp_meetup(p_meetup_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_meetup record;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  perform public.assert_account_can_write();
  if p_status not in ('going', 'maybe', 'declined') then raise exception 'invalid_rsvp'; end if;

  select * into v_meetup from public.meetups where id = p_meetup_id;
  if not found then raise exception 'meetup_not_found'; end if;
  if not public.is_active_member(v_meetup.cluster_id) then raise exception 'not_member'; end if;
  if v_meetup.status not in ('voting', 'confirmed', 'starting', 'active') then
    raise exception 'rsvp_closed';
  end if;

  insert into public.meetup_rsvps (meetup_id, user_id, status)
  values (p_meetup_id, v_me, p_status)
  on conflict (meetup_id, user_id)
  do update set status = excluded.status;
end; $$;

revoke all on function public.rsvp_meetup(uuid, text) from public, anon;
grant execute on function public.rsvp_meetup(uuid, text) to authenticated;
grant execute on function public.rsvp_meetup(uuid, text) to service_role;

create or replace function public.check_in_meetup(p_meetup_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_meetup record;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  perform public.assert_account_can_write();

  select * into v_meetup from public.meetups where id = p_meetup_id;
  if not found then raise exception 'meetup_not_found'; end if;
  if not public.is_active_member(v_meetup.cluster_id) then raise exception 'not_member'; end if;
  if v_meetup.status not in ('confirmed', 'starting', 'active') then
    raise exception 'not_started';
  end if;

  insert into public.meetup_rsvps (meetup_id, user_id, status, checked_in_at)
  values (p_meetup_id, v_me, 'going', now())
  on conflict (meetup_id, user_id)
  do update set status = 'going', checked_in_at = coalesce(public.meetup_rsvps.checked_in_at, now());
end; $$;

revoke all on function public.check_in_meetup(uuid) from public, anon;
grant execute on function public.check_in_meetup(uuid) to authenticated;
grant execute on function public.check_in_meetup(uuid) to service_role;

create or replace function public.submit_meetup_feedback(
  p_meetup_id uuid,
  p_rating text,
  p_meet_again text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_meetup record;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  perform public.assert_account_can_write();
  if p_rating not in ('loved', 'nice', 'not_for_me') then raise exception 'invalid_rating'; end if;
  if p_meet_again is not null and p_meet_again not in ('yes', 'maybe') then
    raise exception 'invalid_meet_again';
  end if;

  select * into v_meetup from public.meetups where id = p_meetup_id;
  if not found then raise exception 'meetup_not_found'; end if;
  if not public.is_active_member(v_meetup.cluster_id) then raise exception 'not_member'; end if;
  if v_meetup.starts_at is null or v_meetup.starts_at > now() then
    raise exception 'feedback_not_open';
  end if;
  if v_meetup.status not in ('confirmed', 'starting', 'active', 'completed') then
    raise exception 'feedback_not_open';
  end if;
  if v_meetup.ends_at is not null and v_meetup.ends_at < now() - interval '7 days' then
    raise exception 'feedback_closed';
  end if;

  insert into public.meetup_feedback (meetup_id, user_id, rating, meet_again)
  values (p_meetup_id, v_me, p_rating, p_meet_again)
  on conflict (meetup_id, user_id)
  do update set rating = excluded.rating, meet_again = excluded.meet_again;
end; $$;

revoke all on function public.submit_meetup_feedback(uuid, text, text) from public, anon;
grant execute on function public.submit_meetup_feedback(uuid, text, text) to authenticated;
grant execute on function public.submit_meetup_feedback(uuid, text, text) to service_role;

-- Single shaped read so clients avoid N+1 counting. Returns the meetup row
-- plus slots with vote counts, the caller vote, and RSVP aggregates.
create or replace function public.get_meetup_state(p_meetup_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_meetup public.meetups;
  v_slots jsonb;
  v_my_slot uuid;
  v_voted int;
  v_going int;
  v_checked int;
  v_feedback jsonb;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  select * into v_meetup from public.meetups where id = p_meetup_id;
  if not found then raise exception 'meetup_not_found'; end if;
  if not public.is_active_member(v_meetup.cluster_id) then raise exception 'not_member'; end if;

  select coalesce(jsonb_agg(t order by t.starts_at, t.id), '[]'::jsonb) into v_slots
  from (
    select s.id, s.starts_at, s.ends_at, count(v.user_id)::int as vote_count
    from public.meetup_slots s
    left join public.meetup_votes v on v.slot_id = s.id
    where s.meetup_id = p_meetup_id
    group by s.id, s.starts_at, s.ends_at
  ) t;

  select slot_id into v_my_slot
  from public.meetup_votes
  where meetup_id = p_meetup_id and user_id = v_me;

  select count(*)::int into v_voted from public.meetup_votes where meetup_id = p_meetup_id;
  select count(*)::int into v_going
  from public.meetup_rsvps where meetup_id = p_meetup_id and status = 'going';
  select count(*)::int into v_checked
  from public.meetup_rsvps where meetup_id = p_meetup_id and checked_in_at is not null;

  select to_jsonb(f) into v_feedback
  from public.meetup_feedback f
  where f.meetup_id = p_meetup_id and f.user_id = v_me;

  return jsonb_build_object(
    'meetup', to_jsonb(v_meetup),
    'slots', v_slots,
    'my_slot_id', v_my_slot,
    'votes_cast', v_voted,
    'going_count', v_going,
    'checked_in_count', v_checked,
    'my_feedback', coalesce(v_feedback, 'null'::jsonb),
    'quorum', public.meetup_quorum()
  );
end; $$;

revoke all on function public.get_meetup_state(uuid) from public, anon;
grant execute on function public.get_meetup_state(uuid) to authenticated;
grant execute on function public.get_meetup_state(uuid) to service_role;

-- Current plus most recent past meetup for the return-to-cluster state.
create or replace function public.get_cluster_meetups(p_cluster_id uuid)
returns setof public.meetups
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_member(p_cluster_id) then
    raise exception 'not_member';
  end if;
  return query
    select m.*
    from public.meetups m
    where m.cluster_id = p_cluster_id
    order by m.created_at desc
    limit 2;
end; $$;

revoke all on function public.get_cluster_meetups(uuid) from public, anon;
grant execute on function public.get_cluster_meetups(uuid) to authenticated;
grant execute on function public.get_cluster_meetups(uuid) to service_role;

-- Cron worker: expire voting without quorum, complete past meetups.
create or replace function public.expire_meetups()
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('meetup-expire'));
  perform set_config('statement_timeout', '120s', true);

  update public.meetups
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now())
  where status = 'voting' and voting_closes_at < now();

  update public.meetups
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where status in ('confirmed', 'starting', 'active')
    and ends_at is not null
    and ends_at < now() - interval '2 hours';
end; $$;

revoke execute on function public.expire_meetups() from public, anon, authenticated;
grant execute on function public.expire_meetups() to service_role;

-- Cron worker: idempotent 24h, 15m, and at-start reminders.
create or replace function public.pump_meetup_reminders()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
begin
  perform pg_advisory_xact_lock(hashtext('meetup-remind'));
  perform set_config('statement_timeout', '120s', true);

  for v_row in
    select * from public.meetups
    where status in ('confirmed', 'starting')
      and starts_at is not null
    order by starts_at
    limit 50
    for update skip locked
  loop
    if v_row.reminder_24h_sent_at is null
       and v_row.starts_at - now() <= interval '24 hours'
       and v_row.starts_at > now() then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select cm.user_id, 'meetup_reminder_24h', v_row.cluster_id,
             'Cluster Meetup tomorrow',
             'Join the group call.',
             jsonb_build_object('meetup_id', v_row.id)
      from public.cluster_members cm
      where cm.cluster_id = v_row.cluster_id and cm.left_at is null;
      update public.meetups set reminder_24h_sent_at = now() where id = v_row.id;
    end if;

    if v_row.reminder_15m_sent_at is null
       and v_row.starts_at - now() <= interval '15 minutes'
       and v_row.starts_at > now() then
      update public.meetups
      set status = 'starting', reminder_15m_sent_at = now()
      where id = v_row.id and status = 'confirmed';
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select cm.user_id, 'meetup_reminder_15m', v_row.cluster_id,
             'Your meetup starts in 15 minutes',
             'Get ready to join.',
             jsonb_build_object('meetup_id', v_row.id)
      from public.cluster_members cm
      where cm.cluster_id = v_row.cluster_id and cm.left_at is null;
      update public.meetups set reminder_15m_sent_at = now() where id = v_row.id;
    end if;

    if v_row.starts_at <= now() and v_row.started_at is null then
      update public.meetups
      set status = 'starting', started_at = coalesce(started_at, now())
      where id = v_row.id and status in ('confirmed', 'starting');
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select cm.user_id, 'meetup_starting', v_row.cluster_id,
             'Your cluster is waiting',
             'Join the meetup now.',
             jsonb_build_object('meetup_id', v_row.id)
      from public.cluster_members cm
      where cm.cluster_id = v_row.cluster_id and cm.left_at is null;
    end if;
  end loop;
end; $$;

revoke execute on function public.pump_meetup_reminders() from public, anon, authenticated;
grant execute on function public.pump_meetup_reminders() to service_role;

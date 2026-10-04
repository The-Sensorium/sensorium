-- 0186_meetup_notification_copy.sql
-- The confirmed and 24h reminder notifications both said "Join the group call."
-- even though nothing is joinable yet. That reads as a live-call command and
-- lands on the meetups list, a dead-end tap. Keep the join command for the
-- live states only (15m stays preparatory, starting stays live) and make the
-- early states informational with an RSVP/view-details action.
-- Re-issues vote_meetup_slot (from 0184) and pump_meetup_reminders (from 0172)
-- unchanged except the two body strings.

create or replace function public.vote_meetup_slot(p_meetup_id uuid, p_slot_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_meetup record;
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

  -- Re-read under the cluster lock so a concurrent confirm or expiry is
  -- observed before writing.
  select * into v_meetup from public.meetups where id = p_meetup_id for update;
  if v_meetup.status <> 'voting' then raise exception 'voting_closed'; end if;
  if v_meetup.voting_closes_at <= now() then raise exception 'voting_closed'; end if;

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
    update public.meetups
    set status = 'confirmed',
        confirmed_slot_id = v_winner,
        starts_at = v_starts,
        ends_at = v_ends
    where id = p_meetup_id and status = 'voting';

    if found then
      -- Winning voters intend to join. Seed them as going so the confirmed
      -- count reflects attendance and late RSVPs can grow it further.
      insert into public.meetup_rsvps (meetup_id, user_id, status)
      select p_meetup_id, v.user_id, 'going'
      from public.meetup_votes v
      where v.meetup_id = p_meetup_id and v.slot_id = v_winner
      on conflict (meetup_id, user_id) do nothing;

      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select cm.user_id, 'meetup_confirmed', v_meetup.cluster_id,
             'Your Cluster Meetup is set',
             'See the time and RSVP.',
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
             'Check the time and get ready.',
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

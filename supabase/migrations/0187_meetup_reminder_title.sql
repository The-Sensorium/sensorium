-- 0187_meetup_reminder_title.sql
-- The 24h reminder title said "Cluster Meetup tomorrow", but the pump fires
-- for anything within 24h, so a meetup later today was mislabeled. A
-- server-date based today/tomorrow switch would still be wrong across user
-- timezones (clients render times in local time), so use a neutral title.
-- Re-issues pump_meetup_reminders (from 0186) unchanged except the title.

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
             'Cluster Meetup coming up',
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

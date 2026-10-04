-- 0184_meetup_attendance_correctness.sql
-- Three small correctness fixes in the meetup RPCs:
-- - rsvp_meetup clears checked_in_at when the new status is not 'going', so
--   checking in and later declining no longer leaves a phantom check-in that
--   inflates checked_in_count and the joining total.
-- - get_meetup_state counts checked_in rows only where status is 'going',
--   matching the rsvp rule above.
-- - vote_meetup_slot drops the unused v_count variable and re-checks
--   voting_closes_at under the cluster lock, closing the window where a
--   ballot expiring mid-transaction could still confirm.

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
  do update set status = excluded.status,
                checked_in_at = case
                  when excluded.status = 'going' then public.meetup_rsvps.checked_in_at
                  else null
                end;
end; $$;

revoke all on function public.rsvp_meetup(uuid, text) from public, anon;
grant execute on function public.rsvp_meetup(uuid, text) to authenticated;
grant execute on function public.rsvp_meetup(uuid, text) to service_role;

create or replace function public.get_meetup_state(p_meetup_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_meetup public.meetups;
  v_slots jsonb;
  v_my_slot uuid;
  v_my_rsvp text;
  v_voted int;
  v_going int;
  v_checked int;
  v_going_ids jsonb;
  v_feedback jsonb;
  v_voters jsonb;
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

  select status into v_my_rsvp
  from public.meetup_rsvps
  where meetup_id = p_meetup_id and user_id = v_me;

  select count(*)::int into v_voted from public.meetup_votes where meetup_id = p_meetup_id;
  select count(*)::int into v_going
  from public.meetup_rsvps where meetup_id = p_meetup_id and status = 'going';
  select count(*)::int into v_checked
  from public.meetup_rsvps where meetup_id = p_meetup_id and status = 'going' and checked_in_at is not null;

  select coalesce(jsonb_agg(t.user_id order by t.created_at, t.user_id), '[]'::jsonb) into v_going_ids
  from (
    select r.user_id, r.created_at
    from public.meetup_rsvps r
    where r.meetup_id = p_meetup_id and r.status = 'going'
  ) t;

  select to_jsonb(f) into v_feedback
  from public.meetup_feedback f
  where f.meetup_id = p_meetup_id and f.user_id = v_me;

  select coalesce(
    jsonb_agg(jsonb_build_object('slot_id', slot_id, 'user_id', user_id)),
    '[]'::jsonb
  ) into v_voters
  from public.meetup_votes
  where meetup_id = p_meetup_id;

  return jsonb_build_object(
    'meetup', to_jsonb(v_meetup),
    'slots', v_slots,
    'my_slot_id', v_my_slot,
    'my_rsvp', coalesce(to_jsonb(v_my_rsvp), 'null'::jsonb),
    'votes_cast', v_voted,
    'going_count', v_going,
    'going_user_ids', v_going_ids,
    'checked_in_count', v_checked,
    'my_feedback', coalesce(v_feedback, 'null'::jsonb),
    'voters', v_voters,
    'quorum', public.meetup_quorum()
  );
end; $$;

revoke all on function public.get_meetup_state(uuid) from public, anon;
grant execute on function public.get_meetup_state(uuid) to authenticated;
grant execute on function public.get_meetup_state(uuid) to service_role;

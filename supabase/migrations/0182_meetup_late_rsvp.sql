-- 0182_meetup_late_rsvp.sql
-- Late joiners could vote only before quorum. Once 3 votes confirmed a slot,
-- voting closed and non-voters had no way to say "I'm in", while the
-- confirmed card counted votes_cast instead of actual RSVPs.
--
-- This keeps quorum-to-confirm as the scheduling rule but treats the
-- confirmed time as open to the whole cluster:
-- - voters for the winning slot seed as going on confirm (do nothing on
--   conflict so an explicit prior choice is kept);
-- - backfills going rows for already-confirmed meetups;
-- - exposes the caller rsvp as my_rsvp in get_meetup_state so clients can
--   render Count me in / You are in for voters and non-voters alike.
-- rsvp_meetup already permits going/maybe/declined in voting, confirmed,
-- starting, and active, so no change is needed there.

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

-- Backfill going rows for meetups confirmed before this change.
insert into public.meetup_rsvps (meetup_id, user_id, status)
select m.id, v.user_id, 'going'
from public.meetups m
join public.meetup_votes v
  on v.meetup_id = m.id and v.slot_id = m.confirmed_slot_id
where m.status in ('confirmed', 'starting', 'active', 'completed')
  and m.confirmed_slot_id is not null
on conflict (meetup_id, user_id) do nothing;

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
  from public.meetup_rsvps where meetup_id = p_meetup_id and checked_in_at is not null;

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
    'checked_in_count', v_checked,
    'my_feedback', coalesce(v_feedback, 'null'::jsonb),
    'voters', v_voters,
    'quorum', public.meetup_quorum()
  );
end; $$;

revoke all on function public.get_meetup_state(uuid) from public, anon;
grant execute on function public.get_meetup_state(uuid) to authenticated;
grant execute on function public.get_meetup_state(uuid) to service_role;

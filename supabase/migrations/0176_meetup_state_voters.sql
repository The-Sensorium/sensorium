-- 0176_meetup_state_voters.sql
-- Expose per-slot voter ids in get_meetup_state so clients can render avatar
-- stacks on the quorum view. Bounded: one row per vote, max one per member.

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

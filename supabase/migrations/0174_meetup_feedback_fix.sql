-- 0174_meetup_feedback_fix.sql
-- Allow feedback from members who checked in even if the start time is still
-- in the future (early join + leave). Previously feedback required
-- starts_at <= now(), so the pre-start Leave feedback button always failed
-- with feedback_not_open.

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
  v_checked_in boolean;
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
  if v_meetup.status not in ('confirmed', 'starting', 'active', 'completed') then
    raise exception 'feedback_not_open';
  end if;

  select exists (
    select 1 from public.meetup_rsvps
    where meetup_id = p_meetup_id and user_id = v_me and checked_in_at is not null
  ) into v_checked_in;

  if v_meetup.starts_at is null then
    raise exception 'feedback_not_open';
  end if;
  if v_meetup.starts_at > now() and not v_checked_in then
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

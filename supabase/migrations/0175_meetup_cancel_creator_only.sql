-- 0175_meetup_cancel_creator_only.sql
-- Only the proposer can retract a proposal, and only while it is still
-- voting. Once 3 members confirm a time, nobody can unilaterally kill it;
-- past meetups complete and quorum-less voting expires via expire_meetups.

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
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now())
  where id = p_meetup_id;
end; $$;

revoke all on function public.cancel_meetup(uuid) from public, anon;
grant execute on function public.cancel_meetup(uuid) to authenticated;
grant execute on function public.cancel_meetup(uuid) to service_role;

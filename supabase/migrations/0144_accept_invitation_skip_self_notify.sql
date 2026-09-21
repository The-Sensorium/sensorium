-- 0144_accept_invitation_skip_self_notify.sql
-- accept_invitation() (live body 0143) inserts the invitee into
-- cluster_members before fanning out the 'A new member has joined'
-- replacement notification, so the fan-out SELECT included the joiner
-- themselves. The joiner already knows they joined (they accepted the
-- invitation); only the pre-existing members should be notified.
-- This keeps the cluster_full guard, round fill, and continuous-refill
-- chain byte-for-byte identical and only narrows the notification target.

create or replace function public.accept_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record; v_active int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv.user_id <> auth.uid() then raise exception 'not_yours'; end if;
  if v_inv.status <> 'pending' then raise exception 'already_responded'; end if;

  if exists (
    select 1 from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    where cm.user_id = auth.uid() and cm.left_at is null
      and c.matching_mode = (select matching_mode from public.clusters where id = v_inv.cluster_id)
  ) then raise exception 'already_in_cluster_of_mode'; end if;

  perform pg_advisory_xact_lock(hashtext('replacement:' || v_inv.cluster_id));

  -- Defensive: never grow a cluster past 8 (legacy orphan invitations/races).
  select count(*) into v_active
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null;
  if v_active >= 8 then raise exception 'cluster_full'; end if;

  update public.invitations set status = 'accepted', responded_at = now()
  where id = p_invitation_id;

  insert into public.cluster_members (cluster_id, user_id)
  values (v_inv.cluster_id, v_inv.user_id);

  delete from public.queue_entries where user_id = v_inv.user_id;

  update public.replacement_rounds
  set status = 'filled', invited_user_id = v_inv.user_id, updated_at = now()
  where cluster_id = v_inv.cluster_id and status = 'inviting';

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select user_id, 'replacement', v_inv.cluster_id, 'A new member has joined', null
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null
    and user_id <> v_inv.user_id;

  -- Continuous refill: chain the next cycle while still below 8 members.
  -- The just-filled round is terminal, so at most one invitation is ever
  -- pending per cluster (sequential, never parallel).
  select count(*) into v_active
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null;
  if v_active < 8 then
    if not exists (
      select 1 from public.replacement_rounds
      where cluster_id = v_inv.cluster_id
        and status in ('selecting_candidates', 'voting', 'inviting')
    ) then
      perform public.start_replacement(v_inv.cluster_id);
    end if;
  end if;
end; $$;

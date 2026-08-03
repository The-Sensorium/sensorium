-- 0026 - Departure notice + "finding a new member" room state
-- Milestone: when a member leaves, notify the remaining members (so they know a
-- spot is open) and keep the room banner (RoomView) able to surface the running
-- replacement round. Follows 0025. Idempotent via db reset.
--
-- leave_cluster (0014) is recreated to also insert a `replacement` notification
-- to every remaining active member with the leaver's display name. The type reuses
-- the existing `replacement` value (pref-gated under votes) and the notification is
-- created by this security-definer RPC, so no new triggers or grants are needed.
-- The room's "finding a new member" banner reads get_replacement_round, which
-- already exists (0023) and is realtime-invalidated (0023/0021).

create or replace function public.leave_cluster(p_cluster_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mode matching_mode;
  v_leaver_name text;
begin
  if not public.is_active_member(p_cluster_id) then raise exception 'not_a_member'; end if;

  select matching_mode into v_mode from public.clusters where id = p_cluster_id;

  select display_name into v_leaver_name
  from public.profiles where id = auth.uid();

  update public.cluster_members set left_at = now()
  where cluster_id = p_cluster_id and user_id = auth.uid();

  insert into public.mode_cooldowns (user_id, mode, available_at)
  values (auth.uid(), v_mode, now() + interval '30 days')
  on conflict (user_id, mode) do update set available_at = excluded.available_at;

  perform public.start_replacement(p_cluster_id);

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select cm.user_id, 'replacement', p_cluster_id,
         coalesce(v_leaver_name, 'A member') || ' left the cluster',
         'A spot just opened — we are finding a new member to fill it.'
  from public.cluster_members cm
  where cm.cluster_id = p_cluster_id and cm.left_at is null;
end; $$;
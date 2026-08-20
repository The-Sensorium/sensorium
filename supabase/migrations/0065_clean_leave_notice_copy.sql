-- 0065 - Clean copy in the departure notice body.
-- The notification body rendered for leaving members used an em dash. The
-- app's copy style avoids em dashes, so recreate leave_cluster (0064) with
-- a plain hyphen. No migration is edited: this supersedes the 0054 body.

create or replace function public.leave_cluster(p_cluster_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mode matching_mode;
  v_leaver_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
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
         'A spot just opened - we are finding a new member to fill it.'
  from public.cluster_members cm
  where cm.cluster_id = p_cluster_id and cm.left_at is null;
end; $$;
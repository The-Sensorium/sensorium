-- 0028_delete_account_departs_clusters.sql
-- Account deletion previously ran `delete from auth.users` directly. The
-- `on delete cascade` on cluster_members then silently removed the seat: no
-- departure notification to the remaining members and no replacement round,
-- leaving the cluster permanently one member short.
--
-- Rewrite delete_my_account to mirror leave_cluster (0026): mark memberships
-- as left, notify remaining members, and start a replacement round for every
-- cluster the user is still an active member of, before deleting the account.
-- This ordering also ensures the departing user is never picked as the
-- replacement round's system/initiating member (start_replacement selects the
-- oldest *active* member), which would otherwise trip the RESTRICT FK on
-- votes.initiated_by -> profiles.id.

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_cluster record;
  v_leaver_name text;
begin
  v_user_id := auth.uid();

  select display_name into v_leaver_name
  from public.profiles where id = v_user_id;

  -- Depart every cluster the user still belongs to, in the same way
  -- leave_cluster does, before the account (and its memberships) is removed.
  for v_cluster in
    select distinct cm.cluster_id
    from public.cluster_members cm
    where cm.user_id = v_user_id and cm.left_at is null
  loop
    update public.cluster_members set left_at = now()
    where cluster_id = v_cluster.cluster_id and user_id = v_user_id;

    insert into public.notifications (user_id, type, cluster_id, title, body)
    select cm.user_id, 'replacement', v_cluster.cluster_id,
           coalesce(v_leaver_name, 'A member') || ' left the cluster',
           'A spot just opened - we are finding a new member to fill it.'
    from public.cluster_members cm
    where cm.cluster_id = v_cluster.cluster_id and cm.left_at is null;

    perform public.start_replacement(v_cluster.cluster_id);
  end loop;

  delete from auth.users where id = v_user_id;
end; $$;

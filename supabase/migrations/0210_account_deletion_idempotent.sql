-- 0210_account_deletion_idempotent.sql
-- Account deletion could run the departure flow more than once. The RPC has no
-- serialization or "already departed" check, so a retried or double-submitted
-- call (two sessions, or a tap that lands before the pending state renders)
-- read the same active memberships before either transaction committed. Each
-- call fanned out a second "left the cluster" notification and called
-- start_replacement, which supersedes the in-flight round, leaving its pending
-- invitation alive and sending a second one.
--
-- This migration:
--   1) Rewrites delete_my_account (live body 0196) to take a per-account
--      departure lock before reading memberships, and to treat a membership as
--      departed only when the UPDATE actually flips left_at from null. A second
--      call therefore finds nothing to depart: no duplicate notification, no
--      second replacement round.
--   2) Gives the departure block the same replacement lock and "no active
--      round" guard as leave_cluster (0143/0168), so it never supersedes an
--      in-flight cycle or orphans its pending invitation.
--   3) Matches leave_cluster's created-cluster rule: origin='created' clusters
--      get the departure notice but no queue replacement, and the notice copy
--      says the cluster continues.
--   4) Rewrites leave_cluster (live body 0168) to take the same departure lock
--      and to update left_at only while it is null. A leave racing a delete can
--      no longer re-stamp the membership and send a second notice.
--   5) Rewrites start_replacement (live body 0014) to skip created clusters and
--      to expire pending queue invitations before opening a new cycle. Whenever
--      a genuine supersede happens (ban, vote removal, stale cleanup), the old
--      invitee can no longer accept a voided invitation, and a queue cluster
--      never has two pending invitations.
--
-- Storage reclaim, role-history stamping, last-admin guard, and the auth user
-- removal are unchanged.

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_cluster record;
  v_leaver_name text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  -- Serialize departures per account. Concurrent deletes and leaves queue
  -- here, then the loser sees no active memberships and changes nothing.
  perform pg_advisory_xact_lock(hashtext('account-departure:' || v_user_id));

  if exists (
    select 1 from public.user_roles
    where user_id = v_user_id and role = 'admin' and revoked_at is null
  ) and not exists (
    select 1 from public.user_roles
    where role = 'admin' and revoked_at is null and user_id <> v_user_id
  ) then
    raise exception 'last_admin_required';
  end if;

  update public.user_roles
  set revoked_at = now(), revoked_by = v_user_id
  where user_id = v_user_id and revoked_at is null;

  perform set_config('storage.allow_delete_query', 'true', true);

  delete from storage.objects o
  using public.messages m
  where o.bucket_id = 'chat-images'
    and o.name = m.image_url
    and m.author_id = v_user_id
    and m.image_url is not null;

  delete from storage.objects o
  using public.posts p
  where o.bucket_id = 'posts-images'
    and o.name = p.image_url
    and p.author_id = v_user_id
    and p.image_url is not null;

  delete from storage.objects o
  using public.post_comments pc
  where o.bucket_id = 'posts-images'
    and o.name = pc.image_url
    and pc.author_id = v_user_id
    and pc.image_url is not null;

  delete from storage.objects o
  using public.profiles p
  where o.bucket_id = 'avatars'
    and o.name = p.avatar_url
    and p.id = v_user_id
    and p.avatar_url is not null;

  delete from storage.objects o
  using public.profiles p
  where o.bucket_id = 'avatars'
    and o.name = p.avatar_thumb_url
    and p.id = v_user_id
    and p.avatar_thumb_url is not null;

  perform set_config('storage.allow_delete_query', 'false', true);

  select display_name into v_leaver_name
  from public.profiles where id = v_user_id;

  for v_cluster in
    select cm.cluster_id, c.origin
    from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    where cm.user_id = v_user_id and cm.left_at is null
    order by cm.cluster_id
  loop
    update public.cluster_members
    set left_at = now()
    where cluster_id = v_cluster.cluster_id
      and user_id = v_user_id
      and left_at is null;

    -- Another call already departed this membership.
    if not found then continue; end if;

    insert into public.notifications (user_id, type, cluster_id, title, body)
    select cm.user_id, 'replacement', v_cluster.cluster_id,
           coalesce(v_leaver_name, 'A member') || ' left the cluster',
           case
             when v_cluster.origin = 'created'
               then 'The cluster continues with its remaining members.'
             else 'A spot just opened - we are finding a new member to fill it.'
           end
    from public.cluster_members cm
    where cm.cluster_id = v_cluster.cluster_id and cm.left_at is null;

    if v_cluster.origin = 'created' then
      continue;
    end if;

    -- Same continuous-refill guard as leave_cluster: an in-flight cycle is
    -- left alone and its pending invitation stays valid.
    perform pg_advisory_xact_lock(hashtext('replacement:' || v_cluster.cluster_id));
    if not exists (
      select 1 from public.replacement_rounds
      where cluster_id = v_cluster.cluster_id
        and status in ('selecting_candidates', 'voting', 'inviting')
    ) then
      perform public.start_replacement(v_cluster.cluster_id);
    end if;
  end loop;

  delete from auth.users where id = v_user_id;
end; $$;

-- Vacancy entry point. Live body is 0014 plus two guards:
--   * Created clusters do not refill from the queue, so the ban path (which
--     calls this for every membership) must not open a round or touch their
--     creator-owned invitations.
--   * A superseded queue round must not leave an accept-able invitation
--     behind: expire pending invites before opening the new cycle.
create or replace function public.start_replacement(p_cluster_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_round_id uuid;
  v_mode matching_mode;
  v_system uuid;
  v_origin text;
begin
  perform pg_advisory_xact_lock(hashtext('replacement:' || p_cluster_id));

  select matching_mode, origin into v_mode, v_origin
  from public.clusters where id = p_cluster_id;
  if v_origin = 'created' then return null; end if;

  update public.replacement_rounds
  set status = 'closed', closed_reason = 'superseded', updated_at = now()
  where cluster_id = p_cluster_id and status in ('selecting_candidates', 'voting', 'inviting');

  update public.invitations
  set status = 'expired', responded_at = now()
  where cluster_id = p_cluster_id and status = 'pending';

  select user_id into v_system from public.cluster_members
  where cluster_id = p_cluster_id and left_at is null
  order by joined_at limit 1;

  insert into public.replacement_rounds (cluster_id, mode, status)
  values (p_cluster_id, v_mode, 'selecting_candidates')
  returning id into v_round_id;

  perform public.source_candidates(v_round_id, v_system);

  return v_round_id;
end; $$;

-- leave_cluster: live body 0168 plus the shared departure lock and an
-- idempotent left_at update. A leave that races an account deletion can no
-- longer re-stamp the membership and send a second departure notice.
create or replace function public.leave_cluster(p_cluster_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mode matching_mode;
  v_leaver_name text;
  v_origin text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(hashtext('account-departure:' || auth.uid()));
  perform public.assert_account_can_write();
  if not public.is_active_member(p_cluster_id) then raise exception 'not_a_member'; end if;

  select matching_mode, origin into v_mode, v_origin
  from public.clusters where id = p_cluster_id;

  select display_name into v_leaver_name
  from public.profiles where id = auth.uid();

  update public.cluster_members set left_at = now()
  where cluster_id = p_cluster_id and user_id = auth.uid() and left_at is null;
  if not found then return; end if;

  if v_origin = 'created' then
    insert into public.notifications (user_id, type, cluster_id, title, body)
    select cm.user_id, 'replacement', p_cluster_id,
           coalesce(v_leaver_name, 'A member') || ' left the cluster',
           'The cluster continues with its remaining members.'
    from public.cluster_members cm
    where cm.cluster_id = p_cluster_id and cm.left_at is null;
    return;
  end if;

  insert into public.mode_cooldowns (user_id, mode, available_at)
  values (auth.uid(), v_mode, now() + public.fn_cooldown_interval(v_mode))
  on conflict (user_id, mode) do update set available_at = excluded.available_at;

  perform pg_advisory_xact_lock(hashtext('replacement:' || p_cluster_id));
  if not exists (
    select 1 from public.replacement_rounds
    where cluster_id = p_cluster_id
      and status in ('selecting_candidates', 'voting', 'inviting')
  ) then
    perform public.start_replacement(p_cluster_id);
  end if;

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select cm.user_id, 'replacement', p_cluster_id,
         coalesce(v_leaver_name, 'A member') || ' left the cluster',
         'A spot just opened - we are finding a new member to fill it.'
  from public.cluster_members cm
  where cm.cluster_id = p_cluster_id and cm.left_at is null;
end; $$;

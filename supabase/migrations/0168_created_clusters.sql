-- 0168_created_clusters.sql
-- User-created clusters (see docs/CREATED_CLUSTER_PLAN.md, all decisions locked).
-- Single migration for the whole feature: schema, reads, invites, lifecycle
-- branches, queue separation, and harassment guards. Nothing in this area had
-- left the local machine before merge, so the work was squashed here rather
-- than spread across numbered fix-ups.
--
-- Design (kept minimal, reuses existing infra):
--   * No new cluster_status value. Created rows stay status='active' and Pending
--     vs Active is derived: origin='created' AND active member count < 3 means
--     Pending, otherwise Active. This keeps RLS, realtime, unread, metrics, and
--     every status consumer working unchanged.
--   * No new matching_mode value. Created rows use matching_mode='open_mix' as
--     a storage sentinel with mode_label='Created' and queue_key='custom:<uuid>'.
--     They are excluded from the mode directory and counts, the queue machinery
--     (join, status, replacement accept guard) ignores created-origin rows, and
--     the UI labels them via origin instead of modeInfo. No cooldown is written
--     on leave.
--   * Reuses public.invitations (pending/accepted/declined/expired + 72h
--     expires_at) with a new inviter_id column, and the invitation_received
--     notification + push pipeline. No replacement_rounds rows are used.
--   * Hardening: progress_replacements() safety net, leave_cluster()
--     auto-refill, and the accept refill chain are queue-only. Created invites
--     take over accept_invitation()/decline_invitation() by origin branch so
--     both old and new clients behave, and replace_member votes are blocked
--     for created clusters (queue refill has no meaning there).
--   * Invite guards: top-up invites rate-limited; an explicit decline is final
--     for that cluster (expiry and creator-cancel stay re-invitable); muting is
--     honored silently (no notify/push, hidden from lists, row still created so
--     the mute is never revealed); suspended/banned accounts are ineligible.

-- 1. Schema: origin + creator on clusters, inviter on invitations.
alter table public.clusters
  add column if not exists origin text not null default 'queue'
    check (origin in ('queue', 'created')),
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.invitations
  add column if not exists inviter_id uuid references public.profiles(id) on delete set null;

create index if not exists clusters_origin_idx on public.clusters(origin);
create index if not exists invitations_inviter_idx on public.invitations(inviter_id)
  where inviter_id is not null;

-- 2. get_my_clusters: include origin + creator (drop first: return type change).
drop function if exists public.get_my_clusters();

create function public.get_my_clusters()
returns table (
  id uuid,
  name text,
  matching_mode public.matching_mode,
  mode_label text,
  queue_key text,
  status public.cluster_status,
  origin text,
  created_by uuid,
  introductions_deadline timestamptz,
  introductions_completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  joined_at timestamptz,
  member_count bigint
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.name,
    c.matching_mode,
    c.mode_label,
    c.queue_key,
    c.status,
    c.origin,
    c.created_by,
    c.introductions_deadline,
    c.introductions_completed_at,
    c.created_at,
    c.updated_at,
    cm.joined_at,
    (select count(*) from public.cluster_members a
     where a.cluster_id = c.id and a.left_at is null)::bigint
  from public.cluster_members cm
  join public.clusters c on c.id = cm.cluster_id
  where cm.user_id = auth.uid()
    and cm.left_at is null
  order by cm.joined_at desc;
$$;

grant execute on function public.get_my_clusters() to authenticated;

-- 3. get_pending_invitations: include origin + inviter (drop first: return type
-- change). Invites from muted inviters are hidden (mute stays silent).
drop function if exists public.get_pending_invitations();

create function public.get_pending_invitations()
returns table (id uuid, cluster_id uuid, cluster_name text, mode_label text,
               origin text, inviter_id uuid, inviter_name text,
               created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.cluster_id, c.name, c.mode_label, c.origin,
         i.inviter_id, p.display_name, i.created_at, i.expires_at
  from public.invitations i
  join public.clusters c on c.id = i.cluster_id
  left join public.profiles p on p.id = i.inviter_id
  where i.user_id = auth.uid() and i.status = 'pending'
    and not exists (
      select 1 from public.user_mutes m
      where m.user_id = auth.uid() and m.muted_user_id = i.inviter_id
    )
  order by i.created_at asc;
$$;

grant execute on function public.get_pending_invitations() to authenticated;

-- 4. Directory: created clusters are private groups, never listed per mode.
-- The anon revokes from 0043 are re-applied here because the DROP+CREATE of
-- get_clusters_by_mode below wipes grants (fresh functions default to
-- EXECUTE TO PUBLIC).
create or replace function public.get_public_cluster_counts()
returns table (
  mode public.matching_mode,
  cluster_count bigint
)
language sql stable security definer set search_path = public as $$
  select c.matching_mode, count(*)::bigint
  from public.clusters c
  where c.status <> 'archived'
    and c.origin = 'queue'
  group by c.matching_mode;
$$;

drop function if exists public.get_clusters_by_mode(public.matching_mode);

create function public.get_clusters_by_mode(p_mode public.matching_mode)
returns table (
  id uuid,
  name text,
  matching_mode public.matching_mode,
  mode_label text,
  status public.cluster_status,
  member_count bigint,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.name,
    c.matching_mode,
    c.mode_label,
    c.status,
    (select count(*) from public.cluster_members a
     where a.cluster_id = c.id and a.left_at is null)::bigint,
    c.created_at
  from public.clusters c
  where c.matching_mode = p_mode
    and c.status <> 'archived'
    and c.origin = 'queue'
  order by c.created_at desc;
$$;

grant execute on function public.get_clusters_by_mode(public.matching_mode) to authenticated;

-- Re-apply the 0043 anon revokes (see §4 header).
revoke execute on function public.get_public_cluster_counts() from public, anon;
revoke execute on function public.get_clusters_by_mode(public.matching_mode) from public, anon;

grant execute on function public.get_public_cluster_counts() to authenticated;
grant execute on function public.get_clusters_by_mode(public.matching_mode) to authenticated;

-- 5. Eligible co-members: anyone the caller has ever shared a cluster with
-- (current or ex, either side), onboarded, on an active account, excluding
-- self. Security definer so the picker works without loosening
-- cluster_members RLS.
create or replace function public.get_eligible_comembers()
returns table (user_id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select distinct p.id, p.display_name, p.avatar_url
  from public.cluster_members mine
  join public.cluster_members theirs on theirs.cluster_id = mine.cluster_id
  join public.profiles p on p.id = theirs.user_id
  where mine.user_id = auth.uid()
    and theirs.user_id <> auth.uid()
    and p.onboarding_completed_at is not null
    and public.is_account_active(p.id)
  order by p.display_name;
$$;

grant execute on function public.get_eligible_comembers() to authenticated;

-- 6. Invite detail for the invitee (who is not yet a member, so RLS alone
-- cannot show the roster): creator + confirmed members + counts. Muted
-- inviters stay silent here too.
create or replace function public.get_created_invite_detail(p_invitation_id uuid)
returns table (cluster_id uuid, cluster_name text, creator_id uuid,
               creator_name text, member_count bigint, pending_count bigint,
               members jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_inv record; v_cluster record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv is null or v_inv.user_id <> auth.uid() then raise exception 'not_yours'; end if;
  if v_inv.status <> 'pending' then raise exception 'already_responded'; end if;

  select * into v_cluster from public.clusters where id = v_inv.cluster_id;
  if v_cluster is null or v_cluster.origin <> 'created' then raise exception 'not_created_cluster'; end if;

  if exists (
    select 1 from public.user_mutes m
    where m.user_id = auth.uid() and m.muted_user_id = v_inv.inviter_id
  ) then raise exception 'not_yours'; end if;

  return query
  select v_cluster.id, v_cluster.name, v_cluster.created_by,
         (select display_name from public.profiles where id = v_cluster.created_by),
         (select count(*) from public.cluster_members cm
          where cm.cluster_id = v_cluster.id and cm.left_at is null)::bigint,
         (select count(*) from public.invitations i
          where i.cluster_id = v_cluster.id and i.status = 'pending')::bigint,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name)
                            order by p.display_name)
           from public.cluster_members cm
           join public.profiles p on p.id = cm.user_id
           where cm.cluster_id = v_cluster.id and cm.left_at is null
         ), '[]'::jsonb);
end; $$;

grant execute on function public.get_created_invite_detail(uuid) to authenticated;

-- 7. Create a cluster: creator becomes member 1, invitees get pending rows.
-- Name is free text, 50-char limit (trimmed, non-empty). Total 3-8.
create or replace function public.create_created_cluster(p_name text, p_invitee_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_invitees uuid[] := coalesce(p_invitee_ids, '{}');
  v_id uuid;
  v_cluster_id uuid;
  v_creator_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  perform public.check_rate_limit('create_cluster', 5, interval '1 day');

  if char_length(v_name) < 1 or char_length(v_name) > 50 then
    raise exception 'invalid_name';
  end if;

  -- Dedup, drop nulls and self.
  select coalesce(array_agg(distinct u), '{}') into v_invitees
  from unnest(v_invitees) as u
  where u is not null and u <> auth.uid();

  if coalesce(array_length(v_invitees, 1), 0) < 2
     or coalesce(array_length(v_invitees, 1), 0) > 7 then
    raise exception 'invalid_invite_count';
  end if;

  perform pg_advisory_xact_lock(hashtext('create-cluster:' || auth.uid()::text));

  -- Every invitee must share cluster history with the creator and hold an
  -- active, onboarded account.
  for v_id in select unnest(v_invitees) loop
    if not exists (
      select 1 from public.profiles p
      where p.id = v_id and p.onboarding_completed_at is not null
    ) then raise exception 'not_eligible:%', v_id; end if;

    if not public.is_account_active(v_id) then raise exception 'not_eligible:%', v_id; end if;

    if not exists (
      select 1 from public.cluster_members mine
      join public.cluster_members theirs on theirs.cluster_id = mine.cluster_id
      where mine.user_id = auth.uid() and theirs.user_id = v_id
    ) then raise exception 'not_eligible:%', v_id; end if;
  end loop;

  insert into public.clusters
    (name, matching_mode, mode_label, queue_key, status,
     introductions_completed_at, origin, created_by)
  values
    (v_name, 'open_mix', 'Created', 'custom:' || gen_random_uuid(),
     'active', now(), 'created', auth.uid())
  returning id into v_cluster_id;

  insert into public.cluster_members (cluster_id, user_id)
  values (v_cluster_id, auth.uid());

  select display_name into v_creator_name from public.profiles where id = auth.uid();

  insert into public.invitations (cluster_id, user_id, inviter_id)
  select v_cluster_id, unnest(v_invitees), auth.uid();

  -- Muted inviters stay silent: the rows exist (creator sees Pending, mute
  -- stays private) but no notification - and therefore no push - is written.
  insert into public.notifications (user_id, type, cluster_id, title, body)
  select uid, 'invitation_received', v_cluster_id,
         'You have been invited to join a cluster',
         coalesce(v_creator_name, 'Someone') || ' invited you to join ' || v_name || '.'
  from unnest(v_invitees) as uid
  where not exists (
    select 1 from public.user_mutes m
    where m.user_id = uid and m.muted_user_id = auth.uid()
  );

  return v_cluster_id;
end; $$;

grant execute on function public.create_created_cluster(text, uuid[]) to authenticated;

-- 8. Creator invites one more person while total (members + pending) is under
-- 8. Rate-limited (20/hour); an explicit decline is final for this cluster
-- (expiry and creator-cancel stay re-invitable).
create or replace function public.invite_to_created_cluster(p_cluster_id uuid, p_invitee_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cluster record; v_total int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  perform public.check_rate_limit('create_cluster_invite', 20, interval '1 hour');

  select * into v_cluster from public.clusters where id = p_cluster_id;
  if v_cluster is null or v_cluster.origin <> 'created' then
    raise exception 'not_created_cluster';
  end if;
  if v_cluster.created_by <> auth.uid() then raise exception 'not_creator'; end if;
  if p_invitee_id is null or p_invitee_id = auth.uid() then raise exception 'invalid_invitee'; end if;

  perform pg_advisory_xact_lock(hashtext('created-invite:' || p_cluster_id::text));

  select count(*) into v_total
  from (
    select user_id from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null
    union
    select user_id from public.invitations
    where cluster_id = p_cluster_id and status = 'pending'
  ) t;
  if v_total >= 8 then raise exception 'cluster_full'; end if;

  if exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and user_id = p_invitee_id and left_at is null
  ) then raise exception 'already_member'; end if;

  if exists (
    select 1 from public.invitations
    where cluster_id = p_cluster_id and user_id = p_invitee_id and status = 'pending'
  ) then raise exception 'already_invited'; end if;

  -- An explicit decline is final for this cluster.
  if exists (
    select 1 from public.invitations
    where cluster_id = p_cluster_id and user_id = p_invitee_id and status = 'declined'
  ) then raise exception 'previously_declined'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_invitee_id and p.onboarding_completed_at is not null
  ) then raise exception 'not_eligible'; end if;

  if not public.is_account_active(p_invitee_id) then raise exception 'not_eligible'; end if;

  if not exists (
    select 1 from public.cluster_members mine
    join public.cluster_members theirs on theirs.cluster_id = mine.cluster_id
    where mine.user_id = auth.uid() and theirs.user_id = p_invitee_id
  ) then raise exception 'not_eligible'; end if;

  insert into public.invitations (cluster_id, user_id, inviter_id)
  values (p_cluster_id, p_invitee_id, auth.uid());

  -- Muted inviters stay silent (see §7).
  if not exists (
    select 1 from public.user_mutes m
    where m.user_id = p_invitee_id and m.muted_user_id = auth.uid()
  ) then
    insert into public.notifications (user_id, type, cluster_id, title, body)
    values (p_invitee_id, 'invitation_received', p_cluster_id,
            'You have been invited to join a cluster',
            (select coalesce(display_name, 'Someone') from public.profiles where id = auth.uid())
            || ' invited you to join ' || v_cluster.name || '.');
  end if;
end; $$;

grant execute on function public.invite_to_created_cluster(uuid, uuid) to authenticated;

-- 9. Creator cancels a pending invite (slot frees, no refill, no round).
-- Withdrawn invites mark 'expired' (re-invitable), never 'declined' (final).
create or replace function public.cancel_created_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record; v_cluster record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv is null then raise exception 'not_found'; end if;

  select * into v_cluster from public.clusters where id = v_inv.cluster_id;
  if v_cluster is null or v_cluster.origin <> 'created' then
    raise exception 'not_created_cluster';
  end if;
  if v_cluster.created_by <> auth.uid() then raise exception 'not_creator'; end if;
  if v_inv.status <> 'pending' then raise exception 'already_responded'; end if;

  update public.invitations set status = 'expired', responded_at = now()
  where id = p_invitation_id;
end; $$;

grant execute on function public.cancel_created_invitation(uuid) to authenticated;

-- 10. Creator-side list of pending invites (RLS only exposes a user's own
-- invitation rows, so the creator needs this security-definer RPC).
create or replace function public.get_created_pending_invites(p_cluster_id uuid)
returns table (invitation_id uuid, user_id uuid, display_name text,
               avatar_url text, created_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_cluster record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_cluster from public.clusters where id = p_cluster_id;
  if v_cluster is null or v_cluster.origin <> 'created' then
    raise exception 'not_created_cluster';
  end if;
  if not public.is_active_member(p_cluster_id) then raise exception 'not_a_member'; end if;

  return query
  select i.id, i.user_id, p.display_name, p.avatar_url, i.created_at, i.expires_at
  from public.invitations i
  join public.profiles p on p.id = i.user_id
  where i.cluster_id = p_cluster_id and i.status = 'pending'
  order by i.created_at asc;
end; $$;

grant execute on function public.get_created_pending_invites(uuid) to authenticated;

-- 11. accept_invitation: created-origin branch (no mode check, no queue
-- delete, no round fill, no refill chain). Activation fan-out fires once:
-- the third confirmed member opens the cluster, and a later leave plus
-- re-accept must not re-fire the banner. Live body is 0145 otherwise
-- (byte-identical below the branch), except the queue-path
-- already_in_cluster_of_mode guard ignores created-origin memberships
-- (created clusters carry no mode, so they must not block matching).
create or replace function public.accept_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record; v_active int; v_joiner_name text; v_origin text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv.user_id <> auth.uid() then raise exception 'not_yours'; end if;
  if v_inv.status <> 'pending' then raise exception 'already_responded'; end if;

  select origin into v_origin from public.clusters where id = v_inv.cluster_id;

  if v_origin = 'created' then
    perform pg_advisory_xact_lock(hashtext('created:' || v_inv.cluster_id));

    select count(*) into v_active
    from public.cluster_members
    where cluster_id = v_inv.cluster_id and left_at is null;
    if v_active >= 8 then raise exception 'cluster_full'; end if;

    update public.invitations set status = 'accepted', responded_at = now()
    where id = p_invitation_id;

    insert into public.cluster_members (cluster_id, user_id)
    values (v_inv.cluster_id, v_inv.user_id)
    on conflict (cluster_id, user_id) do update set left_at = null;

    select display_name into v_joiner_name from public.profiles where id = v_inv.user_id;

    insert into public.notifications (user_id, type, cluster_id, title, body, payload)
    select user_id, 'replacement', v_inv.cluster_id, 'A new member has joined',
      coalesce(v_joiner_name, 'A new member') || ' joined the cluster.',
      jsonb_build_object('new_member_id', v_inv.user_id)
    from public.cluster_members
    where cluster_id = v_inv.cluster_id and left_at is null
      and user_id <> v_inv.user_id;

    -- Activation: the third confirmed member opens the cluster, once only.
    -- A later leave plus re-accept must not re-fire the banner.
    select count(*) into v_active
    from public.cluster_members
    where cluster_id = v_inv.cluster_id and left_at is null;
    if v_active = 3 and not exists (
      select 1 from public.notifications
      where cluster_id = v_inv.cluster_id and type = 'cluster_formed'
    ) then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select user_id, 'cluster_formed', v_inv.cluster_id, 'Your cluster is active',
        'Three members have joined. The cluster is now open.',
        jsonb_build_object('cluster_id', v_inv.cluster_id)
      from public.cluster_members
      where cluster_id = v_inv.cluster_id and left_at is null;
    end if;
    return;
  end if;

  if exists (
    select 1 from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    where cm.user_id = auth.uid() and cm.left_at is null
      and c.matching_mode = (select matching_mode from public.clusters where id = v_inv.cluster_id)
      and c.origin = 'queue'
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

  select display_name into v_joiner_name from public.profiles where id = v_inv.user_id;

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select user_id, 'replacement', v_inv.cluster_id, 'A new member has joined',
    coalesce(v_joiner_name, 'A new member') || ' joined the cluster.',
    jsonb_build_object('new_member_id', v_inv.user_id)
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

-- 12. decline_invitation: created-origin branch notifies the creator and
-- skips the replacement round advance (no round exists). Live body is 0054
-- otherwise (byte-identical below the branch).
create or replace function public.decline_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record; v_origin text; v_creator uuid; v_decliner_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv.user_id <> auth.uid() then raise exception 'not_yours'; end if;

  select origin, created_by into v_origin, v_creator
  from public.clusters where id = v_inv.cluster_id;

  if v_origin = 'created' then
    update public.invitations set status = 'declined', responded_at = now()
    where id = p_invitation_id and status = 'pending';

    if v_creator is not null and v_creator <> auth.uid() then
      select display_name into v_decliner_name from public.profiles where id = auth.uid();
      insert into public.notifications (user_id, type, cluster_id, title, body)
      values (v_creator, 'replacement', v_inv.cluster_id, 'Invitation declined',
              coalesce(v_decliner_name, 'Someone') || ' declined your cluster invitation.');
    end if;
    return;
  end if;

  update public.invitations set status = 'declined', responded_at = now()
  where id = p_invitation_id and status = 'pending';

  perform public.advance_round_on_invitation_void(v_inv.cluster_id, v_inv.user_id);
end; $$;

-- 13. leave_cluster: created clusters skip the cooldown and the replacement
-- refill (no queue semantics). Live body is 0143 otherwise (byte-identical
-- below the branch).
create or replace function public.leave_cluster(p_cluster_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mode matching_mode;
  v_leaver_name text;
  v_origin text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if not public.is_active_member(p_cluster_id) then raise exception 'not_a_member'; end if;

  select matching_mode, origin into v_mode, v_origin
  from public.clusters where id = p_cluster_id;

  select display_name into v_leaver_name
  from public.profiles where id = auth.uid();

  update public.cluster_members set left_at = now()
  where cluster_id = p_cluster_id and user_id = auth.uid();

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

  -- Continuous refill: a departure while a replacement cycle is already in
  -- flight does not supersede it (that would orphan the pending invitation).
  -- The extra vacancy is covered by the accept-chain recount in
  -- accept_invitation(). The check-then-start below holds the same advisory
  -- lock accept_invitation() uses, so concurrent departures cannot open two
  -- rounds for one cluster.
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

-- 14. progress_replacements safety net stays queue-only so it never
-- backfills a pending created cluster from queues. Live body is 0143 plus
-- the origin filter in the safety-net scan.
create or replace function public.progress_replacements() returns void
language plpgsql security definer set search_path = public as $$
declare v_round record; v_system uuid; v_cluster_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('replacement-progress'));
  perform set_config('statement_timeout', '120s', true);

  for v_round in
    select * from public.replacement_rounds
    where status = 'selecting_candidates'
    order by created_at limit 100 for update skip locked
  loop
    select user_id into v_system from public.cluster_members
    where cluster_id = v_round.cluster_id and left_at is null
    order by joined_at limit 1;
    perform public.source_candidates(v_round.id, v_system);
  end loop;

  update public.replacement_rounds
  set status = 'closed', closed_reason = 'pool_exhausted', updated_at = now()
  where status in ('selecting_candidates', 'voting', 'inviting')
    and attempts >= 5
    and created_at < now() - interval '14 days';

  -- Safety net for the continuous-refill invariant: queue-formed active
  -- clusters below 8 members with no active round and no pending invitation
  -- get a fresh cycle (covers pool_exhausted closures and crash windows).
  -- Created clusters are excluded: their size is user-driven, not refilled.
  for v_cluster_id in
    select c.id from public.clusters c
    where c.status = 'active'
      and c.origin = 'queue'
      and (select count(*) from public.cluster_members cm
           where cm.cluster_id = c.id and cm.left_at is null) < 8
      and not exists (
        select 1 from public.replacement_rounds r
        where r.cluster_id = c.id
          and r.status in ('selecting_candidates', 'voting', 'inviting')
      )
      and not exists (
        select 1 from public.invitations i
        where i.cluster_id = c.id and i.status = 'pending'
      )
    order by c.created_at limit 100 for update of c skip locked
  loop
    perform public.start_replacement(v_cluster_id);
  end loop;
end; $$;

-- 15. expire_invitations: created invites free the slot and notify the
-- creator instead of advancing a (nonexistent) replacement round. Live body
-- is 0136 plus the created branch.
create or replace function public.expire_invitations() returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record; v_origin text; v_creator uuid;
begin
  perform pg_advisory_xact_lock(hashtext('invite-expire'));
  perform set_config('statement_timeout', '120s', true);

  for v_inv in
    select * from public.invitations
    where status = 'pending' and expires_at < now()
    order by expires_at limit 100 for update skip locked
  loop
    update public.invitations set status = 'expired', responded_at = now()
    where id = v_inv.id;

    select origin, created_by into v_origin, v_creator
    from public.clusters where id = v_inv.cluster_id;

    if v_origin = 'created' then
      if v_creator is not null then
        insert into public.notifications (user_id, type, cluster_id, title, body)
        values (v_creator, 'replacement', v_inv.cluster_id, 'Invitation expired',
                'A cluster invitation expired without a response.');
      end if;
      continue;
    end if;

    perform public.advance_round_on_invitation_void(v_inv.cluster_id, v_inv.user_id);
  end loop;
end; $$;

-- 16. No queue-refill governance for created clusters: replace_member votes
-- have no meaning without a queue, while change_name votes stay allowed.
-- Live body is 0138 otherwise (byte-identical below the guard).
create or replace function public.start_replace_vote(p_cluster_id uuid, p_target_member_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if not public.is_active_member(p_cluster_id) then raise exception 'not_a_member'; end if;
  if (select origin from public.clusters where id = p_cluster_id) = 'created' then
    raise exception 'not_supported_for_created';
  end if;
  if p_target_member_id = auth.uid() then raise exception 'cannot_vote_self'; end if;
  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and user_id = p_target_member_id and left_at is null
  ) then raise exception 'target_not_member'; end if;

  perform public.check_rate_limit('vote', 10, interval '1 hour');

  insert into public.votes (cluster_id, type, initiated_by, target_member_id)
  values (p_cluster_id, 'replace_member', auth.uid(), p_target_member_id)
  returning id into v_id;

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select user_id, 'vote_started', p_cluster_id, 'A replacement vote has started', null
  from public.cluster_members
  where cluster_id = p_cluster_id and left_at is null;

  return v_id;
end; $$;

-- 17. Queue separation: created rows store matching_mode='open_mix' purely as
-- a storage sentinel and carry no semantic mode, so the queue machinery must
-- ignore created-origin memberships. Otherwise a created-cluster member is
-- falsely reported as occupying the Open Mix tile and blocked from joining
-- the Open Mix queue. Accepting a created invite deliberately leaves queue
-- entries alone: matching stays independent of created clusters.

-- join_queue: live body is 0164 (mode_retired guard, invalid_radius guard,
-- located-country keying). Single change: the already_in_cluster guard.
create or replace function public.join_queue(p_mode matching_mode, p_radius_km int default null)
returns table (queue_key text, waiting int)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_radius int;
  v_country text;
  v_key text;
  v_count int;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  perform public.assert_account_can_write();

  select * into v_profile from public.profiles where id = v_user_id;
  if v_profile.dob is null then raise exception 'complete onboarding first'; end if;

  if p_mode = 'birth_month' then raise exception 'mode_retired'; end if;

  if exists (
    select 1 from public.mode_cooldowns
    where user_id = v_user_id and mode = p_mode and available_at > now()
  ) then raise exception 'cooldown_active'; end if;

  if exists (
    select 1 from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    where cm.user_id = v_user_id and cm.left_at is null
      and c.matching_mode = p_mode and c.origin = 'queue'
  ) then raise exception 'already_in_cluster_of_mode'; end if;

  perform public.check_rate_limit('join_queue', 20, interval '1 hour');

  if p_mode = 'local' then
    v_radius := coalesce(v_profile.local_radius_km, p_radius_km);
    if v_profile.latitude is null or v_profile.local_area is null or v_radius is null then
      raise exception 'location_not_set';
    end if;
    if v_radius not in (10, 50, 100) then
      raise exception 'invalid_radius';
    end if;
    if v_profile.local_radius_km is null then
      update public.profiles set local_radius_km = v_radius where id = v_user_id;
    end if;
    delete from public.queue_entries
    where user_id = v_user_id and mode = 'local';
  else
    v_radius := p_radius_km;
  end if;

  if p_mode = 'local' then
    v_country := coalesce(v_profile.local_country_code, v_profile.country_code);
  else
    v_country := v_profile.country_code;
  end if;

  v_key := public.fn_queue_key(p_mode, v_profile.dob, v_country, v_profile.local_area, v_radius);

  insert into public.queue_entries (user_id, mode, queue_key)
  values (v_user_id, p_mode, v_key)
  on conflict on constraint one_queue_per_mode do nothing;

  select count(*) into v_count
  from public.queue_entries q where q.mode = p_mode and q.queue_key = v_key;

  return query select v_key, v_count;
end; $$;

-- get_my_matching_status: live body is 0164 (located-country keying).
-- Single change: the in-cluster projection ignores created-origin rows.
create or replace function public.get_my_matching_status()
returns table (
  mode matching_mode,
  queue_key text,
  label text,
  joined boolean,
  waiting int,
  cluster_id uuid
)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (
    select dob, country_code, local_country_code, local_area, local_radius_km
    from public.profiles
    where id = auth.uid()
  ),
  keys as (
    select m.mode,
      case
        when m.mode = 'local' and me.local_area is not null
          then public.fn_queue_key(m.mode, me.dob, coalesce(me.local_country_code, me.country_code), me.local_area, me.local_radius_km)
        when m.mode = 'open_mix'
          then public.fn_queue_key(m.mode, me.dob, coalesce(me.local_country_code, me.country_code), me.local_area, me.local_radius_km)
        when m.mode <> 'local'
          then public.fn_queue_key(m.mode, me.dob, coalesce(me.local_country_code, me.country_code), me.local_area, me.local_radius_km)
      end as queue_key
    from me, unnest(enum_range(null::matching_mode)) as m(mode)
  ),
  counts as (
    select q.mode, q.queue_key, count(*)::int as waiting
    from public.queue_entries q
    join keys k on k.mode = q.mode and k.queue_key = q.queue_key
    group by q.mode, q.queue_key
  )
  select k.mode,
         k.queue_key,
         public.fn_mode_label(k.mode, k.queue_key) as label,
         exists (
           select 1 from public.queue_entries q
           where q.user_id = auth.uid() and q.mode = k.mode
         ) as joined,
         coalesce(c.waiting, 0) as waiting,
         (
           select cm.cluster_id
           from public.cluster_members cm
           join public.clusters cl on cl.id = cm.cluster_id
           where cm.user_id = auth.uid()
             and cm.left_at is null
             and cl.matching_mode = k.mode
             and cl.origin = 'queue'
           limit 1
         ) as cluster_id
  from keys k
  left join counts c on c.mode = k.mode and c.queue_key = k.queue_key
  order by k.mode::text;
$function$;

grant execute on function public.get_my_matching_status() to authenticated;

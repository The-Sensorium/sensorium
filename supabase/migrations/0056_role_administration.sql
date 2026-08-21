-- 0056_role_administration.sql
-- Phase 4 of the role-based access plan (docs/ROLE_BASED_ACCESS_PLAN.md):
-- role administration and operational safeguards. The `moderation_notice`
-- notification type was added by 0055 in its own transaction, so this
-- migration may compare against it.
--
--   1. Emit generic target notices for hidden messages, warnings, and
--      suspensions (never revealing the reporter). Banned accounts receive no
--      notification because they cannot enter the app.
--   2. Bake the AAL2/MFA requirement into the staff asserting helpers
--      (assert_can_moderate / assert_can_manage_roles) so every existing and
--      new staff RPC rejects sessions below the required assurance level.
--   3. Convert the SQL-language staff read RPCs to PL/pgSQL so they raise via
--      the asserting helper instead of silently returning empty rows, then add
--      the AAL2 guard to the remaining staff mutations in place.
--   4. Add role grant/revoke/list RPCs with last-admin and staff
--      self-protection rules, plus the warning RPC.
--   5. Add the admin-only audit query and retention indexes.
--
-- Follows 0055. Idempotent via db reset.

-- Global notices (cluster_id null) are already always visible, but be explicit
-- so the type cannot silently slip into an unknown branch.
create or replace function public.notification_allowed(
  p_pref public.notification_prefs,
  p_type public.notification_type,
  p_cluster_id uuid
) returns boolean
language sql stable as $$
  select case
    when p_cluster_id is null then true
    when p_pref is null then true
    when p_type = 'message' then p_pref.messages
    when p_type = 'mention' then p_pref.mentions
    when p_type = 'reaction' then p_pref.reactions
    when p_type in ('vote_started', 'vote_result', 'replacement') then p_pref.votes
    when p_type = 'invitation_received' then p_pref.invitations
    when p_type = 'signal_new' then p_pref.signals
    when p_type = 'moderation_notice' then true
    else true
  end;
$$;

-- -- 2) Staff MFA enforcement -------------------------------------------------

-- Fail closed unless the session carries aal2 in the JWT. Used by the staff
-- asserting helpers, so every staff RPC inherits the requirement.
create function public.assert_staff_aal2()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.jwt_has_aal2() then
    raise exception 'staff_mfa_required' using errcode = '42501';
  end if;
end; $$;

create or replace function public.assert_can_moderate()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_moderate(auth.uid()) then
    raise exception 'insufficient_permission';
  end if;
  perform public.assert_staff_aal2();
end; $$;

create or replace function public.assert_can_manage_roles()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_manage_roles(auth.uid()) then
    raise exception 'insufficient_permission';
  end if;
  perform public.assert_staff_aal2();
end; $$;

-- -- 3) Put every staff RPC on the asserting helpers --------------------------
-- The SQL-language reads below used `can_moderate(auth.uid())` as a WHERE
-- filter, which silently returns nothing for a non-staff (or low-assurance)
-- session. Convert them to PL/pgSQL that raises through the asserting helper.

create or replace function public.get_moderation_queue(
  p_status public.report_status default null,
  p_assigned_to uuid default null,
  p_limit integer default 50,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  cluster_id uuid,
  cluster_name text,
  target_user_id uuid,
  target_display_name text,
  reason public.report_reason,
  details text,
  message_id uuid,
  status public.report_status,
  assigned_to uuid,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_moderate();
  return query
    select
      r.id,
      r.cluster_id,
      c.name,
      r.target_user_id,
      t.display_name,
      r.reason,
      r.details,
      r.message_id,
      r.status,
      r.assigned_to,
      r.created_at
    from public.reports r
    join public.clusters c on c.id = r.cluster_id
    left join public.profiles t on t.id = r.target_user_id
    where (p_status is null or r.status = p_status)
      and (p_assigned_to is null or r.assigned_to = p_assigned_to)
      and (
        p_cursor_created_at is null
        or (r.created_at, r.id) > (p_cursor_created_at, coalesce(p_cursor_id, r.id))
      )
    order by r.created_at asc, r.id asc
    limit greatest(1, least(p_limit, 100));
end; $$;

create or replace function public.get_moderation_report(p_report_id uuid)
returns table (
  id uuid,
  cluster_id uuid,
  cluster_name text,
  reporter_id uuid,
  reporter_display_name text,
  target_user_id uuid,
  target_display_name text,
  reason public.report_reason,
  details text,
  message_id uuid,
  status public.report_status,
  assigned_to uuid,
  reviewed_by uuid,
  resolution_note text,
  evidence jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  prior_reports integer
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_moderate();
  return query
    select
      r.id,
      r.cluster_id,
      coalesce(c.name, 'Removed cluster'),
      r.reporter_id,
      rp.display_name,
      r.target_user_id,
      t.display_name,
      r.reason,
      r.details,
      r.message_id,
      r.status,
      r.assigned_to,
      r.reviewed_by,
      r.resolution_note,
      r.evidence,
      r.created_at,
      r.updated_at,
      (select count(*)::int
       from public.reports pr
       where pr.target_user_id = r.target_user_id and pr.id <> r.id)
    from public.reports r
    left join public.clusters c on c.id = r.cluster_id
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles t on t.id = r.target_user_id
    where r.id = p_report_id;
end; $$;

create or replace function public.get_moderation_message(p_report_id uuid)
returns table (
  message_id uuid,
  author_id uuid,
  content text,
  image_url text,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_moderate();
  return query
    select m.id, m.author_id, m.content, m.image_url, m.created_at
    from public.reports r
    join public.messages m on m.id = r.message_id
    where r.id = p_report_id;
end; $$;

create or replace function public.claim_moderation_report(p_report_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  perform public.assert_can_moderate();

  update public.reports
  set status = 'reviewing', assigned_to = v_actor, updated_at = now()
  where id = p_report_id
    and status = 'pending'
    and assigned_to is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'cannot_claim_not_open_and_unassigned';
  end if;

  insert into public.moderation_actions (actor_id, report_id, action, reason, metadata)
  values (v_actor, p_report_id, 'report_claimed', 'Report claimed', '{}'::jsonb);
end; $$;

create or replace function public.release_moderation_report(p_report_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  perform public.assert_can_moderate();

  update public.reports
  set status = 'pending', assigned_to = null, updated_at = now()
  where id = p_report_id
    and assigned_to = v_actor
    and status in ('pending', 'reviewing');

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'cannot_release_not_assigned_to_you';
  end if;

  insert into public.moderation_actions (actor_id, report_id, action, reason, metadata)
  values (v_actor, p_report_id, 'report_released', 'Report released', '{}'::jsonb);
end; $$;

create or replace function public.resolve_moderation_report(
  p_report_id uuid,
  p_status public.report_status,
  p_note text default null,
  p_action jsonb default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_current public.report_status;
  v_action_recorded jsonb := coalesce(p_action, '{}'::jsonb);
begin
  perform public.assert_can_moderate();

  select status into v_current
  from public.reports where id = p_report_id;
  if v_current is null then
    raise exception 'report_not_found';
  end if;

  if p_status not in ('actioned', 'dismissed') then
    raise exception 'invalid_status_transition';
  end if;
  if v_current not in ('pending', 'reviewing') then
    raise exception 'invalid_status_transition';
  end if;

  if p_status = 'actioned' and (p_note is null or char_length(p_note) = 0) then
    raise exception 'resolution_note_required';
  end if;
  if p_note is not null and char_length(p_note) > 5000 then
    raise exception 'note_too_long';
  end if;

  if jsonb_typeof(v_action_recorded) <> 'object' then
    raise exception 'invalid_action_payload';
  end if;

  update public.reports
  set status = p_status,
      resolution_note = coalesce(p_note, resolution_note),
      reviewed_by = v_actor,
      reviewed_at = now(),
      assigned_to = coalesce(assigned_to, v_actor),
      updated_at = now()
  where id = p_report_id;

  insert into public.moderation_actions (
    actor_id, report_id, action, reason, metadata
  )
  values (
    v_actor,
    p_report_id,
    case
      when p_status = 'actioned'
        then 'report_actioned'::public.moderation_action_type
      else 'report_dismissed'::public.moderation_action_type
    end,
    coalesce(p_note, 'Report resolved'),
    v_action_recorded
  );
end; $$;

-- hide_message/restore_message now reach the asserting helper (which gained the
-- AAL2 check) and hide_message additionally notifies the content author without
-- revealing the reporter's identity.
create or replace function public.hide_message(
  p_message_id uuid,
  p_reason text,
  p_report_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
  v_author uuid;
  v_cluster uuid;
begin
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;

  select author_id, cluster_id into v_author, v_cluster
  from public.messages where id = p_message_id;

  update public.messages
  set moderation_status = 'rejected'
  where id = p_message_id
    and moderation_status is distinct from 'rejected';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'message_not_found_or_already_hidden'; end if;

  insert into public.moderation_actions (actor_id, report_id, message_id, action, reason, metadata)
  values (v_actor, p_report_id, p_message_id, 'message_hidden', p_reason,
          jsonb_build_object('hidden', true));

  if v_author is not null and v_author <> v_actor then
    insert into public.notifications (user_id, type, cluster_id, title, body)
    values (v_author, 'moderation_notice', v_cluster,
            'Your message was hidden',
            'A message you sent was hidden because it did not follow our community guidelines.');
  end if;
end; $$;

create or replace function public.restore_message(
  p_message_id uuid,
  p_reason text,
  p_report_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;

  update public.messages
  set moderation_status = 'approved'
  where id = p_message_id
    and moderation_status is distinct from 'approved';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'message_not_found_or_not_hidden'; end if;

  insert into public.moderation_actions (actor_id, report_id, message_id, action, reason, metadata)
  values (v_actor, p_report_id, p_message_id, 'message_restored', p_reason,
          jsonb_build_object('hidden', false));
end; $$;

-- -- 4) Warnings --------------------------------------------------------------

-- A warning changes no DB state for the target: it is an audit record plus a
-- generic in-app notice. Reason is mandatory and length-limited.
create function public.issue_warning(p_user_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  perform public.assert_can_moderate();
  if p_user_id = v_actor then raise exception 'cannot_warn_self'; end if;
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
  values (v_actor, p_user_id, 'warning_issued', p_reason, jsonb_build_object('type', 'warning'));

  insert into public.notifications (user_id, type, cluster_id, title, body)
  values (p_user_id, 'moderation_notice', null,
          'A warning was issued on your account',
          'Please review the community guidelines to avoid further action.');
end; $$;

-- Suspensions now also reach the target through a generic notice. Bans emit
-- nothing: a banned account cannot enter the app.
create or replace function public.apply_account_restriction(
  p_user_id uuid,
  p_status public.account_status,
  p_reason text,
  p_expires_at timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_current public.account_status;
  v_cluster record;
  v_leaver_name text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_user_id = v_actor then raise exception 'cannot_restrict_self'; end if;
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;

  select status into v_current
  from public.account_restrictions where user_id = p_user_id;
  v_current := coalesce(v_current, 'active');

  -- ---- lift to active ------------------------------------------------------
  if p_status = 'active' then
    if v_current = 'banned' then
      perform public.assert_can_manage_roles();
    else
      perform public.assert_can_moderate();
    end if;

    update public.account_restrictions
    set status = 'active', expires_at = null,
        lifted_by = v_actor, lifted_at = now()
    where user_id = p_user_id;

    insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
    values (v_actor, p_user_id,
            case when v_current = 'banned'
              then 'ban_lifted'::public.moderation_action_type
              else 'suspension_lifted'::public.moderation_action_type
            end,
            p_reason, jsonb_build_object('previous_status', v_current::text));
    return;
  end if;

  -- ---- suspension ----------------------------------------------------------
  if p_status = 'suspended' then
    perform public.assert_can_moderate();

    if not public.can_manage_roles(v_actor) and exists (
      select 1 from public.user_roles
      where user_id = p_user_id and revoked_at is null
    ) then
      raise exception 'cannot_restrict_staff';
    end if;

    if not public.can_manage_roles(v_actor) then
      if p_expires_at is null then raise exception 'expiry_required'; end if;
      if p_expires_at > now() + interval '7 days' then raise exception 'suspension_too_long'; end if;
    end if;

    insert into public.account_restrictions (user_id, status, expires_at, reason, changed_by, changed_at)
    values (p_user_id, 'suspended', p_expires_at, p_reason, v_actor, now())
    on conflict (user_id)
    do update set status = excluded.status, expires_at = excluded.expires_at,
                  reason = excluded.reason, changed_by = excluded.changed_by,
                  changed_at = excluded.changed_at, lifted_by = null, lifted_at = null;

    insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
    values (v_actor, p_user_id, 'suspension_applied', p_reason,
            jsonb_build_object('expires_at', p_expires_at));

    insert into public.notifications (user_id, type, cluster_id, title, body)
    values (p_user_id, 'moderation_notice', null,
            'Your account has been temporarily suspended',
            'You will regain access when the restriction ends. If you think this is a mistake, please contact support.');
    return;
  end if;

  -- ---- permanent ban -------------------------------------------------------
  perform public.assert_can_manage_roles();

  if exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin' and revoked_at is null
  ) and not exists (
    select 1 from public.user_roles
    where role = 'admin' and revoked_at is null and user_id <> p_user_id
  ) then
    raise exception 'last_admin_required';
  end if;

  update public.user_roles
  set revoked_at = now(), revoked_by = v_actor
  where user_id = p_user_id and revoked_at is null;

  select display_name into v_leaver_name from public.profiles where id = p_user_id;

  for v_cluster in
    select distinct cm.cluster_id
    from public.cluster_members cm
    where cm.user_id = p_user_id and cm.left_at is null
  loop
    update public.cluster_members set left_at = now()
    where cluster_id = v_cluster.cluster_id and user_id = p_user_id;

    insert into public.notifications (user_id, type, cluster_id, title, body)
    select cm.user_id, 'replacement', v_cluster.cluster_id,
           coalesce(v_leaver_name, 'A member') || ' left the cluster',
           'A spot just opened - we are finding a new member to fill it.'
    from public.cluster_members cm
    where cm.cluster_id = v_cluster.cluster_id and cm.left_at is null;

    perform public.start_replacement(v_cluster.cluster_id);
  end loop;

  insert into public.account_restrictions (user_id, status, reason, changed_by, changed_at)
  values (p_user_id, 'banned', p_reason, v_actor, now())
  on conflict (user_id)
  do update set status = excluded.status, expires_at = null,
                reason = excluded.reason, changed_by = excluded.changed_by,
                changed_at = excluded.changed_at, lifted_by = null, lifted_at = null;

  insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
  values (v_actor, p_user_id, 'ban_applied', p_reason, '{}'::jsonb);
end; $$;

-- -- 5) Role administration ---------------------------------------------------

-- Grant (or re-activate) a platform role. Requires an active admin with AAL2.
-- granted_by always comes from auth.uid(); the client can never pass it.
create function public.grant_platform_role(
  p_user_id uuid,
  p_role public.platform_role,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  perform public.assert_can_manage_roles();
  if p_user_id = v_actor then raise exception 'cannot_grant_self'; end if;
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 500 then raise exception 'reason_too_long'; end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  -- Insert a new active assignment. The unique partial index (active rows only)
  -- means a second active grant for the same (user_id, role) conflicts and is
  -- ignored; row_count then reports 0 and the friendly error is raised. A
  -- revoked historical row for the same user/role stays untouched, keeping an
  -- auditable trail.
  insert into public.user_roles (user_id, role, granted_by, grant_reason)
  values (p_user_id, p_role, v_actor, p_reason)
  on conflict (user_id, role) where revoked_at is null do nothing;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'already_assigned';
  end if;

  insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
  values (v_actor, p_user_id, 'role_granted', p_reason,
          jsonb_build_object('role', p_role::text));
end; $$;

-- Revoke a platform role. Guards: active admin + AAL2, cannot remove the last
-- active admin, target must currently hold the role.
create function public.revoke_platform_role(
  p_user_id uuid,
  p_role public.platform_role,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  perform public.assert_can_manage_roles();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 500 then raise exception 'reason_too_long'; end if;

  if p_role = 'admin' and exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin' and revoked_at is null
  ) and not exists (
    select 1 from public.user_roles
    where role = 'admin' and revoked_at is null and user_id <> p_user_id
  ) then
    raise exception 'last_admin_required';
  end if;

  update public.user_roles
  set revoked_at = now(), revoked_by = v_actor
  where user_id = p_user_id and role = p_role and revoked_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'not_assigned'; end if;

  insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
  values (v_actor, p_user_id, 'role_revoked', p_reason,
          jsonb_build_object('role', p_role::text));
end; $$;

-- Active assignments (with an option to include history), admin + AAL2 only.
create function public.list_platform_roles(
  p_role public.platform_role default null,
  p_include_revoked boolean default false
)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  email text,
  role public.platform_role,
  granted_by uuid,
  granted_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  grant_reason text
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_manage_roles();
  return query
    select
      r.id,
      r.user_id,
      p.display_name,
      p.email,
      r.role,
      r.granted_by,
      r.granted_at,
      r.revoked_by,
      r.revoked_at,
      r.grant_reason
    from public.user_roles r
    left join public.profiles p on p.id = r.user_id
    where (p_role is null or r.role = p_role)
      and (p_include_revoked or r.revoked_at is null)
    order by p.display_name asc, r.granted_at asc;
end; $$;

-- -- 6) Admin audit query + retention indexes --------------------------------

-- Append-only audit view, newest first, paginated. Admin + AAL2 only.
create function public.get_moderation_audit(
  p_limit integer default 50,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  created_at timestamptz,
  actor_id uuid,
  actor_display_name text,
  target_user_id uuid,
  target_display_name text,
  report_id uuid,
  message_id uuid,
  action public.moderation_action_type,
  reason text,
  metadata jsonb
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_manage_roles();
  return query
    select
      a.id,
      a.created_at,
      a.actor_id,
      act.display_name,
      a.target_user_id,
      tgt.display_name,
      a.report_id,
      a.message_id,
      a.action,
      a.reason,
      a.metadata
    from public.moderation_actions a
    left join public.profiles act on act.id = a.actor_id
    left join public.profiles tgt on tgt.id = a.target_user_id
    where (
      p_cursor_created_at is null
      or (a.created_at, a.id) < (p_cursor_created_at, coalesce(p_cursor_id, a.id))
    )
    order by a.created_at desc, a.id desc
    limit greatest(1, least(p_limit, 200));
end; $$;

-- 24-month retention job support: purge/anonymize works oldest-first on both
-- the audit log and report rows.
create index moderation_actions_retention_idx
  on public.moderation_actions (created_at asc);
create index reports_retention_idx
  on public.reports (created_at asc);
create index user_roles_granted_idx
  on public.user_roles (granted_at asc);

-- -- 7) Grants ---------------------------------------------------------------

grant execute on function
  public.assert_staff_aal2()
  to authenticated;

grant execute on function
  public.issue_warning(uuid, text),
  public.grant_platform_role(uuid, public.platform_role, text),
  public.revoke_platform_role(uuid, public.platform_role, text),
  public.list_platform_roles(public.platform_role, boolean)
  to authenticated;

grant execute on function
  public.get_moderation_audit(integer, timestamptz, uuid)
  to authenticated;

grant execute on function
  public.issue_warning(uuid, text),
  public.grant_platform_role(uuid, public.platform_role, text),
  public.revoke_platform_role(uuid, public.platform_role, text),
  public.list_platform_roles(public.platform_role, boolean),
  public.get_moderation_audit(integer, timestamptz, uuid)
  to service_role;
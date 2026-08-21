-- 0066_moderation_workflow_guards.sql
-- Follow-ups from a review of moderation workflow consistency:
--
--   1. resolve_moderation_report never checked the claim. Anyone with
--      can_moderate could dismiss or action a report another moderator was
--      reviewing. A reviewing report is now locked to its assignee; a pending
--      (unclaimed) report stays resolvable by any moderator, which implicitly
--      assigns it (the existing coalesce in the update).
--   2. Actions (hide_message, restore_message, issue_warning,
--      apply_account_restriction) never transitioned their report to
--      `actioned`, so the UI could only ever close a case with a hardcoded
--      `no action taken` dismissal. Each action now accepts an optional
--      p_report_id and closes it as `actioned` through a shared helper, so the
--      actual enforcement and the case's terminal status move together.
--   3. hide_message/restore_message stored p_report_id verbatim. The shared
--      helper validates the report exists, is still open, and references the
--      exact message or target being acted on before touching any state.
--   4. The 0064 lift branch could "lift" an already-active account, writing a
--      fresh lifted_at plus an audit row for no state change. It now raises
--      restriction_not_active before writing anything.

-- -- 1) Shared report validation + close --------------------------------------
-- assert_report_actionable validates the reference up front so every action
-- raises a friendly code before its audit row insert (which carries the FKs to
-- reports) or any state change. close_report_as_actioned then moves the report
-- to `actioned`. Both are internal: granted to nobody, and called by the
-- security definer actions below, so they run as the postgres owner.

create function public.assert_report_actionable(
  p_report_id uuid,
  p_message_id uuid default null,
  p_target_user_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_status public.report_status;
  v_assigned uuid;
  v_msg uuid;
  v_target uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;

  select status, assigned_to, message_id, target_user_id
    into v_status, v_assigned, v_msg, v_target
  from public.reports where id = p_report_id;
  if v_status is null then
    raise exception 'report_not_found';
  end if;
  if v_status not in ('pending', 'reviewing') then
    raise exception 'report_not_open';
  end if;

  -- Mirrors the resolve_moderation_report claim lock below: a reviewing report
  -- can only be acted on by the moderator currently assigned to it.
  if v_status = 'reviewing' and v_assigned is distinct from v_actor then
    raise exception 'cannot_resolve_not_assigned_to_you';
  end if;

  if p_message_id is not null and v_msg is distinct from p_message_id then
    raise exception 'report_message_mismatch';
  end if;
  if p_target_user_id is not null and v_target is distinct from p_target_user_id then
    raise exception 'report_target_mismatch';
  end if;
end; $$;

create function public.close_report_as_actioned(
  p_report_id uuid,
  p_note text,
  p_message_id uuid default null,
  p_target_user_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_assigned uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();
  perform public.assert_report_actionable(p_report_id, p_message_id, p_target_user_id);

  select assigned_to into v_assigned
  from public.reports where id = p_report_id;

  update public.reports
  set status = 'actioned',
      resolution_note = coalesce(p_note, resolution_note),
      reviewed_by = v_actor,
      reviewed_at = now(),
      assigned_to = coalesce(v_assigned, v_actor),
      updated_at = now()
  where id = p_report_id;
end; $$;

-- -- 2) resolve_moderation_report claim lock -----------------------------------

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
  v_assigned uuid;
  v_action_recorded jsonb := coalesce(p_action, '{}'::jsonb);
begin
  perform public.assert_can_moderate();

  select status, assigned_to into v_current, v_assigned
  from public.reports where id = p_report_id;
  if v_current is null then
    raise exception 'report_not_found';
  end if;

  -- 0066: a reviewing report belongs to its assignee. Anyone may resolve a
  -- pending unclaimed report; the update below assigns it to the resolver.
  if v_current = 'reviewing' and v_assigned is distinct from v_actor then
    raise exception 'cannot_resolve_not_assigned_to_you';
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

-- -- 3) Content actions close their report -------------------------------------

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

  if p_report_id is not null then
    perform public.assert_report_actionable(p_report_id, p_message_id);
  end if;

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

  if p_report_id is not null then
    perform public.close_report_as_actioned(p_report_id, p_reason, p_message_id);
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

  if p_report_id is not null then
    perform public.assert_report_actionable(p_report_id, p_message_id);
  end if;

  update public.messages
  set moderation_status = 'approved'
  where id = p_message_id
    and moderation_status is distinct from 'approved';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'message_not_found_or_not_hidden'; end if;

  insert into public.moderation_actions (actor_id, report_id, message_id, action, reason, metadata)
  values (v_actor, p_report_id, p_message_id, 'message_restored', p_reason,
          jsonb_build_object('hidden', false));

  if p_report_id is not null then
    perform public.close_report_as_actioned(p_report_id, p_reason, p_message_id);
  end if;
end; $$;

-- -- 4) Warnings + restrictions gain the optional report reference ------------

-- issue_warning grows an optional p_report_id so a warning issued from a case
-- closes it as actioned instead of leaving it open. The old 2-arg signature is
-- dropped first (0057 lesson): two overloads make PostgREST reject calls that
-- omit the defaulted argument as ambiguous.
drop function public.issue_warning(uuid, text);

create function public.issue_warning(
  p_user_id uuid,
  p_reason text,
  p_report_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  perform public.assert_can_moderate();
  if p_user_id = v_actor then raise exception 'cannot_warn_self'; end if;
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;

  if p_report_id is not null then
    perform public.assert_report_actionable(p_report_id, null, p_user_id);
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  insert into public.moderation_actions (actor_id, target_user_id, report_id, action, reason, metadata)
  values (v_actor, p_user_id, p_report_id, 'warning_issued', p_reason,
          jsonb_build_object('type', 'warning'));

  insert into public.notifications (user_id, type, cluster_id, title, body)
  values (p_user_id, 'moderation_notice', null,
          'A warning was issued on your account',
          'Please review the community guidelines to avoid further action.');

  if p_report_id is not null then
    perform public.close_report_as_actioned(p_report_id, p_reason, null, p_user_id);
  end if;
end; $$;

drop function public.apply_account_restriction(uuid, public.account_status, text, timestamptz);

create function public.apply_account_restriction(
  p_user_id uuid,
  p_status public.account_status,
  p_reason text,
  p_expires_at timestamptz default null,
  p_report_id uuid default null
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

  if p_report_id is not null then
    perform public.assert_report_actionable(p_report_id, null, p_user_id);
  end if;

  select status into v_current
  from public.account_restrictions where user_id = p_user_id;
  v_current := coalesce(v_current, 'active');

  -- ---- lift to active ------------------------------------------------------
  if p_status = 'active' then
    if v_current = 'banned' then
      perform public.assert_can_manage_roles();
    else
      perform public.assert_can_moderate();
      -- Mirror the apply branch: only admins may touch a staff member's
      -- restriction, so a moderator cannot undo an admin's suspension.
      if not public.can_manage_roles(v_actor) and exists (
        select 1 from public.user_roles
        where user_id = p_user_id and revoked_at is null
      ) then
        raise exception 'cannot_restrict_staff';
      end if;
    end if;

    -- 0066: lifting an already-active account is a no-op. Refuse before
    -- writing a fresh lifted_at or an audit row for nothing.
    if v_current = 'active' then
      raise exception 'restriction_not_active';
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

    -- A permanent ban is only reversible by an admin (see the lift branch
    -- above). Downgrading it to a short suspension would otherwise let a
    -- moderator undo it once the expiry lapses and 0062 auto-lifts the row.
    if v_current = 'banned' and not public.can_manage_roles(v_actor) then
      raise exception 'cannot_unban';
    end if;

    -- Every suspension is temporary: a NULL expiry would be a permanent,
    -- non-lapsing restriction that bypasses the ban semantics (no role
    -- revocation, no cluster departure). Permanent removal is `banned`.
    if p_expires_at is null then raise exception 'expiry_required'; end if;

    if not public.can_manage_roles(v_actor) and exists (
      select 1 from public.user_roles
      where user_id = p_user_id and revoked_at is null
    ) then
      raise exception 'cannot_restrict_staff';
    end if;

    if not public.can_manage_roles(v_actor) then
      if p_expires_at > now() + interval '7 days' then raise exception 'suspension_too_long'; end if;
    end if;

    insert into public.account_restrictions (user_id, status, expires_at, reason, changed_by, changed_at)
    values (p_user_id, 'suspended', p_expires_at, p_reason, v_actor, now())
    on conflict (user_id)
    do update set status = excluded.status, expires_at = excluded.expires_at,
                  reason = excluded.reason, changed_by = excluded.changed_by,
                  changed_at = excluded.changed_at, lifted_by = null, lifted_at = null;

    insert into public.moderation_actions (actor_id, target_user_id, report_id, action, reason, metadata)
    values (v_actor, p_user_id, p_report_id, 'suspension_applied', p_reason,
            jsonb_build_object('expires_at', p_expires_at));

    insert into public.notifications (user_id, type, cluster_id, title, body)
    values (p_user_id, 'moderation_notice', null,
            'Your account has been temporarily suspended',
            'You will regain access when the restriction ends. If you think this is a mistake, please contact support.');

    if p_report_id is not null then
      perform public.close_report_as_actioned(p_report_id, p_reason, null, p_user_id);
    end if;
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

  insert into public.moderation_actions (actor_id, target_user_id, report_id, action, reason, metadata)
  values (v_actor, p_user_id, p_report_id, 'ban_applied', p_reason, '{}'::jsonb);

  if p_report_id is not null then
    perform public.close_report_as_actioned(p_report_id, p_reason, null, p_user_id);
  end if;
end; $$;

-- -- 5) Grants ----------------------------------------------------------------
-- The old signatures are gone (their grants dropped with them). The new
-- signatures keep the authenticated-only grant policy from 0062: staff RPCs
-- raise not_authenticated for the service_role context, so no service_role
-- grant. close_report_as_actioned is internal and granted to nobody.

grant execute on function
  public.issue_warning(uuid, text, uuid),
  public.apply_account_restriction(uuid, public.account_status, text, timestamptz, uuid)
  to authenticated;
-- 0070_email_enqueue_in_enforcement.sql
-- Wires the email outbox into the enforcement lifecycle. Every enforcement RPC
-- is recreated with `create or replace` (same signatures, so the existing
-- grants survive) to enqueue the matching email in the SAME transaction as the
-- action, next to the existing in-app notifications. Reporters are emailed a
-- generic outcome when their report is resolved; admission of this eases the
-- PRD's "reporters are not notified" line by entering the record through an
-- outbox row instead of a notification row.

-- -- 1) report_member ---------------------------------------------------------
-- 0053 signature (0057 dropped the 4-arg overload). Adds the reporter an email
-- confirmation immediately after the report row is committed in-transaction.

create or replace function public.report_member(
  p_cluster_id uuid,
  p_target_user_id uuid,
  p_reason public.report_reason,
  p_details text default null,
  p_message_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reporter_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_reporter_id is null then
    raise exception 'not_authenticated';
  end if;

  perform public.assert_account_can_write();
  if v_reporter_id = p_target_user_id then
    raise exception 'cannot_report_self';
  end if;

  if p_details is not null and char_length(p_details) > 2000 then
    raise exception 'details_too_long';
  end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = v_reporter_id
  ) then
    raise exception 'not_a_member';
  end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = p_target_user_id
  ) then
    raise exception 'not_a_member';
  end if;

  if p_message_id is not null and not exists (
    select 1 from public.messages
    where id = p_message_id
      and cluster_id = p_cluster_id
      and author_id = p_target_user_id
      and deleted_at is null
  ) then
    raise exception 'message_not_reportable';
  end if;

  if exists (
    select 1 from public.reports
    where reporter_id = v_reporter_id
      and target_user_id = p_target_user_id
      and status in ('pending', 'reviewing')
  ) then
    raise exception 'duplicate_report';
  end if;

  insert into public.reports (
    cluster_id, reporter_id, target_user_id, reason, details, message_id
  )
  values (p_cluster_id, v_reporter_id, p_target_user_id, p_reason, p_details, p_message_id)
  returning id into v_report_id;

  perform public.enqueue_email(
    v_reporter_id,
    'report-received',
    jsonb_build_object(
      'display_name', (select display_name from public.profiles where id = v_reporter_id),
      'reason', p_reason::text
    )
  );

  return v_report_id;
end;
$$;

-- -- 2) close_report_as_actioned ----------------------------------------------
-- 0066 internal helper. Now also emails the reporter a generic "actioned"
-- outcome (never internal notes or staff identity). Same signature, no grant.

create or replace function public.close_report_as_actioned(
  p_report_id uuid,
  p_note text,
  p_message_id uuid default null,
  p_target_user_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_assigned uuid;
  v_reporter uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();
  perform public.assert_report_actionable(p_report_id, p_message_id, p_target_user_id);

  select assigned_to, reporter_id into v_assigned, v_reporter
  from public.reports where id = p_report_id;

  update public.reports
  set status = 'actioned',
      resolution_note = coalesce(p_note, resolution_note),
      reviewed_by = v_actor,
      reviewed_at = now(),
      assigned_to = coalesce(v_assigned, v_actor),
      updated_at = now()
  where id = p_report_id;

  if v_reporter is not null and v_reporter <> v_actor then
    perform public.enqueue_email(
      v_reporter,
      'report-resolved',
      jsonb_build_object(
        'display_name', (select display_name from public.profiles where id = v_reporter),
        'outcome', 'actioned'
      )
    );
  end if;
end; $$;

-- -- 3) resolve_moderation_report ---------------------------------------------
-- 0066 signature. Emails the reporter the generic outcome (dismissed or
-- actioned) unless the reporter row is gone (anonymized deletion).

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
  v_reporter uuid;
  v_action_recorded jsonb := coalesce(p_action, '{}'::jsonb);
begin
  perform public.assert_can_moderate();

  select status, assigned_to, reporter_id into v_current, v_assigned, v_reporter
  from public.reports where id = p_report_id;
  if v_current is null then
    raise exception 'report_not_found';
  end if;

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

  if v_reporter is not null and v_reporter <> v_actor then
    perform public.enqueue_email(
      v_reporter,
      'report-resolved',
      jsonb_build_object(
        'display_name', (select display_name from public.profiles where id = v_reporter),
        'outcome', p_status::text
      )
    );
  end if;
end; $$;

-- -- 4) hide_message ----------------------------------------------------------
-- 0066 body plus the message-hidden email to the author (same guard as the
-- in-app notification: never the acting moderator themselves).

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

    perform public.enqueue_email(
      v_author,
      'message-hidden',
      jsonb_build_object(
        'display_name', (select display_name from public.profiles where id = v_author)
      )
    );
  end if;

  if p_report_id is not null then
    perform public.close_report_as_actioned(p_report_id, p_reason, p_message_id);
  end if;
end; $$;

-- -- 5) issue_warning ---------------------------------------------------------
-- 0066 body plus the warning email.

create or replace function public.issue_warning(
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

  perform public.enqueue_email(
    p_user_id,
    'warning-issued',
    jsonb_build_object(
      'display_name', (select display_name from public.profiles where id = p_user_id)
    )
  );

  if p_report_id is not null then
    perform public.close_report_as_actioned(p_report_id, p_reason, null, p_user_id);
  end if;
end; $$;

-- -- 6) apply_account_restriction ---------------------------------------------
-- 0066 body plus the restriction emails: account-suspended (with expiry and
-- appeal URL), account-banned (with appeal URL), and restriction-lifted on the
-- manual lift path.

create or replace function public.apply_account_restriction(
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
      if not public.can_manage_roles(v_actor) and exists (
        select 1 from public.user_roles
        where user_id = p_user_id and revoked_at is null
      ) then
        raise exception 'cannot_restrict_staff';
      end if;
    end if;

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

    perform public.enqueue_email(
      p_user_id,
      'restriction-lifted',
      jsonb_build_object(
        'display_name', (select display_name from public.profiles where id = p_user_id)
      )
    );
    return;
  end if;

  -- ---- suspension ----------------------------------------------------------
  if p_status = 'suspended' then
    perform public.assert_can_moderate();

    if v_current = 'banned' and not public.can_manage_roles(v_actor) then
      raise exception 'cannot_unban';
    end if;

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

    perform public.enqueue_email(
      p_user_id,
      'account-suspended',
      jsonb_build_object(
        'display_name', (select display_name from public.profiles where id = p_user_id),
        'expires_at', p_expires_at,
        'appeal_url', public.app_url() || '/appeal'
      )
    );

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

  perform public.enqueue_email(
    p_user_id,
    'account-banned',
    jsonb_build_object(
      'display_name', (select display_name from public.profiles where id = p_user_id),
      'appeal_url', public.app_url() || '/appeal'
    )
  );

  if p_report_id is not null then
    perform public.close_report_as_actioned(p_report_id, p_reason, null, p_user_id);
  end if;
end; $$;

-- -- 7) lift_expired_suspensions ----------------------------------------------
-- 0062 body plus a restriction-lifted email for each auto-lifted row. The cron
-- (0062) still schedules this function; only the body changes.

create or replace function public.lift_expired_suspensions()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
begin
  for v_row in
    select user_id
    from public.account_restrictions
    where status = 'suspended'
      and expires_at is not null
      and expires_at <= now()
  loop
    update public.account_restrictions
    set status = 'active'::public.account_status,
        expires_at = null,
        lifted_by = null,
        lifted_at = now()
    where user_id = v_row.user_id;

    insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
    values (null, v_row.user_id, 'suspension_lifted',
            'Suspension period ended', jsonb_build_object('auto_lifted', true));

    perform public.enqueue_email(
      v_row.user_id,
      'restriction-lifted',
      jsonb_build_object(
        'display_name', (select display_name from public.profiles where id = v_row.user_id)
      )
    );
  end loop;
end; $$;
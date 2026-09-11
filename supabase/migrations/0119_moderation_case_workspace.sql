-- 0119_moderation_case_workspace.sql
-- Phase 2 of ADMIN_MODERATION_PRODUCTION_PLAN: turn the case page into a real
-- workspace. Adds staff-only case notes, a rich case read model, a unified
-- timeline, and assignment/escalation/severity RPCs. All staff access stays
-- behind security-definer RPCs; the notes table has RLS with no policies.

-- -- 1) Case notes table --------------------------------------------------------

create table public.moderation_case_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  note text not null check (char_length(note) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index moderation_case_notes_report_idx
  on public.moderation_case_notes (report_id, created_at asc)
  where deleted_at is null;

alter table public.moderation_case_notes enable row level security;

grant select, insert, update on public.moderation_case_notes to service_role;

-- -- 2) Audit actions for workspace events ---------------------------------------

alter type public.moderation_action_type add value if not exists 'note_added';
alter type public.moderation_action_type add value if not exists 'case_assigned';
alter type public.moderation_action_type add value if not exists 'case_escalated';
alter type public.moderation_action_type add value if not exists 'severity_changed';

-- -- 3) Rich case read model ------------------------------------------------------
-- One row per report with reporter/target context shaped for staff triage.
-- Moderators see display names and history; emails stay admin-only elsewhere.

create or replace function public.get_moderation_case_v2(p_report_id uuid)
returns table (
  id uuid,
  cluster_id uuid,
  cluster_name text,
  reason public.report_reason,
  details text,
  target_kind text,
  message_id uuid,
  post_id uuid,
  comment_id uuid,
  status public.report_status,
  severity public.moderation_severity,
  priority_score integer,
  due_at timestamptz,
  last_activity_at timestamptz,
  assigned_to uuid,
  assigned_to_display_name text,
  reviewed_by uuid,
  resolution_note text,
  evidence jsonb,
  escalated_at timestamptz,
  escalated_by uuid,
  escalation_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  prior_reports integer,
  reporter jsonb,
  target jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_can_moderate();

  return query
  select
    r.id,
    r.cluster_id,
    coalesce(c.name, 'Removed cluster'),
    r.reason,
    r.details,
    case
      when r.post_id is not null then 'post'
      when r.comment_id is not null then 'comment'
      when r.message_id is not null then 'message'
      else 'member'
    end,
    r.message_id,
    r.post_id,
    r.comment_id,
    r.status,
    r.severity,
    r.priority_score,
    r.due_at,
    r.last_activity_at,
    r.assigned_to,
    ap.display_name,
    r.reviewed_by,
    r.resolution_note,
    r.evidence,
    r.escalated_at,
    r.escalated_by,
    r.escalation_reason,
    r.created_at,
    r.updated_at,
    (select count(*)::int from public.reports pr
      where pr.target_user_id = r.target_user_id and pr.id <> r.id),
    (select jsonb_build_object(
      'id', rp.id,
      'display_name', rp.display_name,
      'account_created_at', rp.created_at,
      'reports_30d', (select count(*)::int from public.reports rr
        where rr.reporter_id = r.reporter_id and rr.created_at > now() - interval '30 days'),
      'total_reports', (select count(*)::int from public.reports rr
        where rr.reporter_id = r.reporter_id),
      'dismissed_reports', (select count(*)::int from public.reports rr
        where rr.reporter_id = r.reporter_id and rr.status = 'dismissed')
    )
    from public.profiles rp where rp.id = r.reporter_id),
    (select jsonb_build_object(
      'id', t.id,
      'display_name', t.display_name,
      'account_status', coalesce(ar.status, 'active'),
      'restriction_expires_at', ar.expires_at,
      'restriction_reason', ar.reason,
      'roles', coalesce((select array_agg(ur.role::text) from public.user_roles ur
        where ur.user_id = t.id and ur.revoked_at is null), '{}'),
      'cluster_names', coalesce((select array_agg(cc.name) from (
        select cc.name from public.cluster_members cm
        join public.clusters cc on cc.id = cm.cluster_id
        where cm.user_id = t.id and cm.left_at is null
        limit 10
      ) cc), '{}'),
      'prior_reports', (select count(*)::int from public.reports pr
        where pr.target_user_id = t.id and pr.id <> r.id),
      'prior_actions', (select count(*)::int from public.moderation_actions ma
        where ma.target_user_id = t.id)
    )
    from public.profiles t left join public.account_restrictions ar on ar.user_id = t.id
    where t.id = r.target_user_id)
  from public.reports r
  left join public.clusters c on c.id = r.cluster_id
  left join public.profiles ap on ap.id = r.assigned_to
  where r.id = p_report_id;
end; $$;

-- -- 4) Unified timeline: audit actions + staff notes, oldest first --------------

create or replace function public.get_moderation_case_timeline(p_report_id uuid)
returns table (
  entry_id uuid,
  kind text,
  created_at timestamptz,
  actor_id uuid,
  actor_display_name text,
  action text,
  body text,
  metadata jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_can_moderate();
  if not exists (select 1 from public.reports where id = p_report_id) then
    raise exception 'report_not_found';
  end if;

  return query
  select
    ma.id as entry_id, 'action'::text as kind, ma.created_at as created_at,
    ma.actor_id as actor_id, p.display_name as actor_display_name,
    ma.action::text as action, ma.reason as body, ma.metadata as metadata
  from public.moderation_actions ma
  left join public.profiles p on p.id = ma.actor_id
  where ma.report_id = p_report_id
  union all
  select
    n.id as entry_id, 'note'::text as kind, n.created_at as created_at,
    n.author_id as actor_id, p.display_name as actor_display_name,
    'note'::text as action, n.note as body,
    jsonb_build_object('edited_at', n.edited_at) as metadata
  from public.moderation_case_notes n
  left join public.profiles p on p.id = n.author_id
  where n.report_id = p_report_id and n.deleted_at is null
  order by created_at asc, entry_id asc;
end; $$;

-- -- 5) Case notes -----------------------------------------------------------------

create or replace function public.add_moderation_case_note(p_report_id uuid, p_note text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_status public.report_status;
  v_note_id uuid;
begin
  perform public.assert_can_moderate();
  if p_note is null or char_length(p_note) = 0 then
    raise exception 'note_required';
  end if;
  if char_length(p_note) > 2000 then
    raise exception 'note_too_long';
  end if;

  select status into v_status from public.reports where id = p_report_id;
  if v_status is null then
    raise exception 'report_not_found';
  end if;
  if v_status not in ('pending', 'reviewing') then
    raise exception 'report_not_open';
  end if;

  insert into public.moderation_case_notes (report_id, author_id, note)
  values (p_report_id, v_actor, p_note)
  returning id into v_note_id;

  insert into public.moderation_actions (actor_id, report_id, action, reason, metadata)
  values (v_actor, p_report_id, 'note_added', 'Case note added',
    jsonb_build_object('note_id', v_note_id));

  return v_note_id;
end; $$;

create or replace function public.edit_moderation_case_note(p_note_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_author uuid;
  v_deleted timestamptz;
begin
  perform public.assert_can_moderate();
  if p_note is null or char_length(p_note) = 0 then
    raise exception 'note_required';
  end if;
  if char_length(p_note) > 2000 then
    raise exception 'note_too_long';
  end if;

  select author_id, deleted_at into v_author, v_deleted
  from public.moderation_case_notes where id = p_note_id;
  if not found then
    raise exception 'note_not_found';
  end if;
  if v_deleted is not null then
    raise exception 'note_deleted';
  end if;
  if v_author is distinct from v_actor and not public.can_manage_roles(v_actor) then
    raise exception 'insufficient_permission';
  end if;

  update public.moderation_case_notes
  set note = p_note, edited_at = now()
  where id = p_note_id;
end; $$;

create or replace function public.delete_moderation_case_note(p_note_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_author uuid;
begin
  perform public.assert_can_moderate();

  select author_id into v_author
  from public.moderation_case_notes where id = p_note_id and deleted_at is null;
  if not found then
    if not exists (select 1 from public.moderation_case_notes where id = p_note_id) then
      raise exception 'note_not_found';
    end if;
    raise exception 'note_deleted';
  end if;
  if v_author is distinct from v_actor and not public.can_manage_roles(v_actor) then
    raise exception 'insufficient_permission';
  end if;

  update public.moderation_case_notes
  set deleted_at = now()
  where id = p_note_id and deleted_at is null;
end; $$;

-- -- 6) Assignment / escalation / severity --------------------------------------------

create or replace function public.assign_moderation_case(
  p_report_id uuid,
  p_assignee uuid,
  p_reason text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_status public.report_status;
begin
  perform public.assert_can_manage_roles();
  if p_reason is null or char_length(p_reason) = 0 then
    raise exception 'reason_required';
  end if;
  if p_reason is not null and char_length(p_reason) > 2000 then
    raise exception 'reason_too_long';
  end if;
  if not public.can_moderate(p_assignee) then
    raise exception 'assignee_not_staff';
  end if;

  select status into v_status from public.reports where id = p_report_id;
  if v_status is null then
    raise exception 'report_not_found';
  end if;
  if v_status not in ('pending', 'reviewing') then
    raise exception 'report_not_open';
  end if;

  update public.reports
  set assigned_to = p_assignee,
      status = case when v_status = 'pending' then 'reviewing'::public.report_status else status end,
      updated_at = now()
  where id = p_report_id;

  insert into public.moderation_actions (actor_id, report_id, action, reason, metadata)
  values (v_actor, p_report_id, 'case_assigned', p_reason,
    jsonb_build_object('assignee', p_assignee));
end; $$;

create or replace function public.escalate_moderation_case(p_report_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_row public.reports%rowtype;
begin
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then
    raise exception 'reason_required';
  end if;
  if char_length(p_reason) > 2000 then
    raise exception 'reason_too_long';
  end if;

  select * into v_row from public.reports where id = p_report_id;
  if v_row.id is null then
    raise exception 'report_not_found';
  end if;
  if v_row.status not in ('pending', 'reviewing') then
    raise exception 'report_not_open';
  end if;
  if v_row.assigned_to is not null and v_row.assigned_to is distinct from v_actor
    and not public.can_manage_roles(v_actor) then
    raise exception 'cannot_escalate_not_assigned_to_you';
  end if;

  update public.reports
  set escalated_at = now(),
      escalated_by = v_actor,
      escalation_reason = p_reason,
      severity = case when severity in ('low', 'medium') then 'high'::public.moderation_severity else severity end,
      priority_score = public.moderation_priority_for_severity(
        case when severity in ('low', 'medium') then 'high'::public.moderation_severity else severity end),
      due_at = now() + public.moderation_sla_for_severity(
        case when severity in ('low', 'medium') then 'high'::public.moderation_severity else severity end),
      updated_at = now()
  where id = p_report_id;

  insert into public.moderation_actions (actor_id, report_id, action, reason, metadata)
  values (v_actor, p_report_id, 'case_escalated', p_reason, '{}'::jsonb);
end; $$;

create or replace function public.set_moderation_case_severity(
  p_report_id uuid,
  p_severity public.moderation_severity,
  p_reason text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_row public.reports%rowtype;
begin
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then
    raise exception 'reason_required';
  end if;
  if char_length(p_reason) > 2000 then
    raise exception 'reason_too_long';
  end if;

  select * into v_row from public.reports where id = p_report_id;
  if v_row.id is null then
    raise exception 'report_not_found';
  end if;
  if v_row.status not in ('pending', 'reviewing') then
    raise exception 'report_not_open';
  end if;
  if v_row.assigned_to is not null and v_row.assigned_to is distinct from v_actor
    and not public.can_manage_roles(v_actor) then
    raise exception 'cannot_retriage_not_assigned_to_you';
  end if;

  update public.reports
  set severity = p_severity,
      priority_score = public.moderation_priority_for_severity(p_severity),
      due_at = now() + public.moderation_sla_for_severity(p_severity),
      updated_at = now()
  where id = p_report_id;

  insert into public.moderation_actions (actor_id, report_id, action, reason, metadata)
  values (v_actor, p_report_id, 'severity_changed', p_reason,
    jsonb_build_object('from', v_row.severity, 'to', p_severity));
end; $$;

-- -- 7) Grants --------------------------------------------------------------------------

grant execute on function
  public.get_moderation_case_v2(uuid),
  public.get_moderation_case_timeline(uuid),
  public.add_moderation_case_note(uuid, text),
  public.edit_moderation_case_note(uuid, text),
  public.delete_moderation_case_note(uuid),
  public.assign_moderation_case(uuid, uuid, text),
  public.escalate_moderation_case(uuid, text),
  public.set_moderation_case_severity(uuid, public.moderation_severity, text)
  to authenticated;

grant execute on function
  public.get_moderation_case_v2(uuid),
  public.get_moderation_case_timeline(uuid),
  public.add_moderation_case_note(uuid, text),
  public.edit_moderation_case_note(uuid, text),
  public.delete_moderation_case_note(uuid),
  public.assign_moderation_case(uuid, uuid, text),
  public.escalate_moderation_case(uuid, text),
  public.set_moderation_case_severity(uuid, public.moderation_severity, text)
  to service_role;

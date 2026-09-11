-- 0124_appeals_v2.sql
-- Phase 6 of ADMIN_MODERATION_PRODUCTION_PLAN: appeals get assignment, SLA,
-- internal notes, original decision references, and a second-admin rule for
-- rejecting permanent-ban appeals. All appeal RPCs stay admin-only
-- (can_manage_roles); members keep using submit_appeal/get_my_appeal.

-- -- 1) Columns ---------------------------------------------------------------------

alter table public.appeals
  add column assigned_to uuid references public.profiles(id) on delete set null,
  add column review_due_at timestamptz,
  add column internal_note text check (internal_note is null or char_length(internal_note) <= 2000),
  add column decision_reason_code text,
  add column original_action_id uuid references public.moderation_actions(id) on delete set null,
  add column original_report_id uuid references public.reports(id) on delete set null,
  add column second_review_requested_by uuid references public.profiles(id) on delete set null,
  add column second_review_requested_at timestamptz;

create index appeals_assigned_to_idx
  on public.appeals (assigned_to)
  where status = 'submitted' and assigned_to is not null;

create index appeals_review_due_idx
  on public.appeals (review_due_at)
  where status = 'submitted' and review_due_at is not null;

-- Backfill: due dates anchor on creation; original refs point at the latest
-- enforcement action / report against the appellant before they appealed.
update public.appeals a
set review_due_at = coalesce(review_due_at, created_at + interval '72 hours'),
    original_action_id = coalesce(original_action_id, (
      select ma.id from public.moderation_actions ma
      where ma.target_user_id = a.user_id
        and ma.action in ('warning_issued', 'suspension_applied', 'ban_applied')
        and ma.created_at <= a.created_at
      order by ma.created_at desc, ma.id desc
      limit 1
    )),
    original_report_id = coalesce(original_report_id, (
      select r.id from public.reports r
      where r.target_user_id = a.user_id
        and r.created_at <= a.created_at
      order by r.created_at desc, r.id desc
      limit 1
    ));

-- -- 2) Audit actions -------------------------------------------------------------------

alter type public.moderation_action_type add value if not exists 'appeal_claimed';
alter type public.moderation_action_type add value if not exists 'appeal_released';
alter type public.moderation_action_type add value if not exists 'appeal_assigned';
alter type public.moderation_action_type add value if not exists 'appeal_note_added';
alter type public.moderation_action_type add value if not exists 'appeal_second_review_requested';

-- -- 3) submit_appeal captures context (same signature, grants survive) ----------------------

create or replace function public.submit_appeal(p_details text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_restriction public.account_restrictions%rowtype;
  v_appeal_id uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_details is null or char_length(btrim(p_details)) = 0 then
    raise exception 'details_required';
  end if;
  if char_length(p_details) > 5000 then raise exception 'details_too_long'; end if;

  select r.* into v_restriction
  from public.account_restrictions r
  where r.user_id = v_user_id;

  if public.is_account_active(v_user_id) then
    raise exception 'account_not_restricted';
  end if;
  if v_restriction.status not in ('suspended', 'banned') then
    raise exception 'account_not_restricted';
  end if;

  insert into public.appeals (
    user_id, appealed_status, appealed_reason, appealed_expires_at, details,
    review_due_at, original_action_id, original_report_id
  )
  values (
    v_user_id,
    v_restriction.status,
    v_restriction.reason,
    v_restriction.expires_at,
    btrim(p_details),
    now() + interval '72 hours',
    (select ma.id from public.moderation_actions ma
      where ma.target_user_id = v_user_id
        and ma.action in ('warning_issued', 'suspension_applied', 'ban_applied')
      order by ma.created_at desc, ma.id desc
      limit 1),
    (select r.id from public.reports r
      where r.target_user_id = v_user_id
      order by r.created_at desc, r.id desc
      limit 1)
  )
  returning id into v_appeal_id;

  perform public.enqueue_email(
    v_user_id,
    'appeal-received',
    jsonb_build_object(
      'display_name', (select display_name from public.profiles where id = v_user_id),
      'appeal_url', public.app_url() || '/appeal'
    )
  );

  return v_appeal_id;
end; $$;

-- -- 4) Assignment ------------------------------------------------------------------------------

create or replace function public.claim_appeal(p_appeal_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  perform public.assert_can_manage_roles();

  update public.appeals
  set assigned_to = v_actor, updated_at = now()
  where id = p_appeal_id
    and status = 'submitted'
    and assigned_to is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'cannot_claim_appeal';
  end if;

  insert into public.moderation_actions (actor_id, action, reason, metadata)
  select v_actor, 'appeal_claimed', 'Appeal claimed', jsonb_build_object('appeal_id', p_appeal_id)
  where exists (select 1 from public.appeals where id = p_appeal_id);
end; $$;

create or replace function public.release_appeal(p_appeal_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  perform public.assert_can_manage_roles();

  update public.appeals
  set assigned_to = null, updated_at = now()
  where id = p_appeal_id
    and status = 'submitted'
    and assigned_to = v_actor;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'cannot_release_appeal';
  end if;

  insert into public.moderation_actions (actor_id, action, reason, metadata)
  values (v_actor, 'appeal_released', 'Appeal released', jsonb_build_object('appeal_id', p_appeal_id));
end; $$;

create or replace function public.assign_appeal(
  p_appeal_id uuid,
  p_assignee uuid,
  p_reason text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_status public.appeal_status;
begin
  perform public.assert_can_manage_roles();
  if p_reason is null or char_length(p_reason) = 0 then
    raise exception 'reason_required';
  end if;
  if char_length(p_reason) > 2000 then
    raise exception 'reason_too_long';
  end if;
  if not public.can_manage_roles(p_assignee) then
    raise exception 'assignee_not_admin';
  end if;

  select status into v_status from public.appeals where id = p_appeal_id;
  if v_status is null then
    raise exception 'appeal_not_found';
  end if;
  if v_status <> 'submitted' then
    raise exception 'appeal_already_resolved';
  end if;

  update public.appeals
  set assigned_to = p_assignee, updated_at = now()
  where id = p_appeal_id;

  insert into public.moderation_actions (actor_id, action, reason, metadata)
  values (v_actor, 'appeal_assigned', p_reason,
    jsonb_build_object('appeal_id', p_appeal_id, 'assignee', p_assignee));
end; $$;

-- -- 5) Internal notes (staff-only, overwrite latest) ----------------------------------------------------

create or replace function public.add_appeal_note(p_appeal_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  perform public.assert_can_manage_roles();
  if p_note is null or char_length(p_note) = 0 then
    raise exception 'note_required';
  end if;
  if char_length(p_note) > 2000 then
    raise exception 'note_too_long';
  end if;
  if not exists (select 1 from public.appeals where id = p_appeal_id) then
    raise exception 'appeal_not_found';
  end if;

  update public.appeals
  set internal_note = p_note, updated_at = now()
  where id = p_appeal_id;

  insert into public.moderation_actions (actor_id, action, reason, metadata)
  values (v_actor, 'appeal_note_added', 'Appeal note added', jsonb_build_object('appeal_id', p_appeal_id));
end; $$;

-- -- 6) Second review for ban-appeal rejections ---------------------------------------------------------------

create or replace function public.request_appeal_second_review(p_appeal_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_row public.appeals%rowtype;
begin
  perform public.assert_can_manage_roles();

  select * into v_row from public.appeals where id = p_appeal_id;
  if v_row.id is null then
    raise exception 'appeal_not_found';
  end if;
  if v_row.status <> 'submitted' then
    raise exception 'appeal_already_resolved';
  end if;

  update public.appeals
  set second_review_requested_by = v_actor,
      second_review_requested_at = now(),
      updated_at = now()
  where id = p_appeal_id;

  insert into public.moderation_actions (actor_id, action, reason, metadata)
  values (v_actor, 'appeal_second_review_requested', 'Second review requested',
    jsonb_build_object('appeal_id', p_appeal_id));
end; $$;

-- -- 7) Appeal detail V2 ------------------------------------------------------------------------------------------------

create or replace function public.get_admin_appeal_v2(p_appeal_id uuid)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  appealed_status public.account_status,
  appealed_reason text,
  appealed_expires_at timestamptz,
  details text,
  status public.appeal_status,
  response text,
  created_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  assigned_to uuid,
  assigned_to_display_name text,
  review_due_at timestamptz,
  internal_note text,
  decision_reason_code text,
  second_review_requested_by uuid,
  second_review_requested_at timestamptz,
  original_action jsonb,
  original_report_id uuid,
  appellant jsonb,
  recent_reports jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_can_manage_roles();
  if not exists (select 1 from public.appeals where appeals.id = p_appeal_id) then
    raise exception 'appeal_not_found';
  end if;

  return query
  select
    a.id,
    a.user_id,
    p.display_name,
    a.appealed_status,
    a.appealed_reason,
    a.appealed_expires_at,
    a.details,
    a.status,
    a.response,
    a.created_at,
    a.decided_at,
    a.decided_by,
    a.assigned_to,
    ap.display_name,
    a.review_due_at,
    a.internal_note,
    a.decision_reason_code,
    a.second_review_requested_by,
    a.second_review_requested_at,
    (select jsonb_build_object(
      'id', ma.id,
      'action', ma.action,
      'reason', ma.reason,
      'policy_code', ma.policy_code,
      'actor_display_name', mp.display_name,
      'created_at', ma.created_at
    )
    from public.moderation_actions ma
    left join public.profiles mp on mp.id = ma.actor_id
    where ma.id = a.original_action_id),
    a.original_report_id,
    (select jsonb_build_object(
      'account_status', coalesce(ar.status, 'active'),
      'restriction_expires_at', ar.expires_at,
      'restriction_reason', ar.reason,
      'roles', coalesce((select array_agg(ur.role::text) from public.user_roles ur
        where ur.user_id = a.user_id and ur.revoked_at is null), '{}'),
      'cluster_names', coalesce((select array_agg(cc.name) from (
        select cc.name from public.cluster_members cm
        join public.clusters cc on cc.id = cm.cluster_id
        where cm.user_id = a.user_id and cm.left_at is null
        limit 10
      ) cc), '{}'),
      'prior_reports', (select count(*)::int from public.reports r where r.target_user_id = a.user_id),
      'prior_actions', (select count(*)::int from public.moderation_actions ma where ma.target_user_id = a.user_id)
    )
    from public.profiles t left join public.account_restrictions ar on ar.user_id = t.id
    where t.id = a.user_id),
    coalesce((select jsonb_agg(row_to_json(s)) from (
      select r.id, r.reason::text as reason, r.status::text as status, r.created_at
      from public.reports r
      where r.target_user_id = a.user_id
      order by r.created_at desc, r.id desc
      limit 5
    ) s), '[]'::jsonb)
  from public.appeals a
  left join public.profiles p on p.id = a.user_id
  left join public.profiles ap on ap.id = a.assigned_to
  where a.id = p_appeal_id;
end; $$;

-- -- 8) Appeal queue V2 ------------------------------------------------------------------------------------------------------------
-- p_filters: status (submitted|resolved), assignee (all|unassigned|mine|<uuid>),
-- sla (all_open|overdue|open|closed|all), order (asc|desc).

create or replace function public.list_appeals_page_v2(
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 25,
  p_cursor jsonb default null
)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  appealed_status public.account_status,
  snippet text,
  status public.appeal_status,
  created_at timestamptz,
  decided_at timestamptz,
  assigned_to uuid,
  assigned_to_display_name text,
  review_due_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_status public.appeal_status;
  v_assignee text;
  v_sla text;
  v_order text := 'desc';
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_limit integer;
begin
  perform public.assert_can_manage_roles();

  v_status := nullif(p_filters ->> 'status', '')::public.appeal_status;
  v_assignee := coalesce(nullif(p_filters ->> 'assignee', ''), 'all');
  v_sla := coalesce(nullif(p_filters ->> 'sla', ''), 'all_open');
  if coalesce(p_filters ->> 'order', 'desc') in ('asc', 'desc') then
    v_order := p_filters ->> 'order';
  end if;
  v_cursor_at := nullif(p_cursor ->> 'created_at', '')::timestamptz;
  v_cursor_id := nullif(p_cursor ->> 'id', '')::uuid;
  v_limit := greatest(1, least(coalesce(p_limit, 25), 100));

  return query
  select
    a.id,
    a.user_id,
    p.display_name,
    a.appealed_status,
    left(a.details, 140),
    a.status,
    a.created_at,
    a.decided_at,
    a.assigned_to,
    ap.display_name,
    a.review_due_at
  from public.appeals a
  left join public.profiles p on p.id = a.user_id
  left join public.profiles ap on ap.id = a.assigned_to
  where (v_status is null or a.status = v_status)
    and (
      case v_sla
        when 'overdue' then (a.status = 'submitted' and a.review_due_at is not null and a.review_due_at < now())
        when 'open' then (a.status = 'submitted')
        when 'closed' then (a.status = 'resolved')
        when 'all' then true
        else (a.status = 'submitted')
      end
    )
    and (
      case v_assignee
        when 'all' then true
        when 'unassigned' then a.assigned_to is null and a.status = 'submitted'
        when 'mine' then a.assigned_to = v_me
        else a.assigned_to = nullif(v_assignee, '')::uuid
      end
    )
    and (
      v_cursor_at is null
      or (v_order = 'asc' and (a.created_at, a.id) > (v_cursor_at, coalesce(v_cursor_id, a.id)))
      or (v_order = 'desc' and (a.created_at, a.id) < (v_cursor_at, coalesce(v_cursor_id, a.id)))
    )
  order by
    case when v_order = 'desc' then a.created_at end desc,
    case when v_order = 'desc' then a.id end desc,
    case when v_order = 'asc' then a.created_at end asc,
    case when v_order = 'asc' then a.id end asc
  limit v_limit;
end; $$;

-- -- 9) decide_appeal with internal note, policy code, and second review -----------------------------------------
-- New signature, so drop the old one first. Rejecting a ban appeal requires a
-- prior second-review request from a DIFFERENT admin.

drop function public.decide_appeal(uuid, boolean, text);

create function public.decide_appeal(
  p_appeal_id uuid,
  p_accept boolean,
  p_response text,
  p_internal_note text default null,
  p_decision_reason_code text default null,
  p_second_review_confirmed boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_appeal public.appeals%rowtype;
begin
  perform public.assert_can_manage_roles();
  if p_response is null or char_length(btrim(p_response)) = 0 then
    raise exception 'response_required';
  end if;
  if char_length(p_response) > 2000 then raise exception 'response_too_long'; end if;
  if p_internal_note is not null and char_length(p_internal_note) > 2000 then
    raise exception 'note_too_long';
  end if;
  perform public.assert_valid_policy_code(p_decision_reason_code);

  select a.* into v_appeal
  from public.appeals a
  where a.id = p_appeal_id
  for update;
  if v_appeal.id is null then raise exception 'appeal_not_found'; end if;
  if v_appeal.status <> 'submitted' then raise exception 'appeal_already_resolved'; end if;

  if not p_accept and v_appeal.appealed_status = 'banned' then
    if v_appeal.second_review_requested_by is null
      or v_appeal.second_review_requested_by = v_actor then
      raise exception 'second_review_required';
    end if;
    if not p_second_review_confirmed then
      raise exception 'second_review_confirm_required';
    end if;
  end if;

  if p_accept and v_appeal.user_id is not null then
    begin
      perform public.apply_account_restriction(v_appeal.user_id, 'active', p_response);
    exception when others then
      if sqlerrm like '%restriction_not_active%' then
        null;
      else
        raise;
      end if;
    end;
  end if;

  update public.appeals
  set status = 'resolved',
      response = btrim(p_response),
      internal_note = coalesce(p_internal_note, internal_note),
      decision_reason_code = coalesce(p_decision_reason_code, decision_reason_code),
      decided_by = v_actor,
      decided_at = now(),
      updated_at = now()
  where id = p_appeal_id;

  insert into public.moderation_actions (actor_id, target_user_id, reason, action, metadata)
  values (v_actor, v_appeal.user_id,
          'Appeal ' || case when p_accept then 'accepted' else 'rejected' end,
          'appeal_decided',
          jsonb_build_object('accepted', p_accept, 'appealed_status', v_appeal.appealed_status::text,
            'appeal_id', p_appeal_id, 'decision_reason_code', p_decision_reason_code));

  if v_appeal.user_id is not null then
    perform public.enqueue_email(
      v_appeal.user_id,
      'appeal-resolved',
      jsonb_build_object(
        'display_name', (select display_name from public.profiles where id = v_appeal.user_id),
        'accepted', p_accept,
        'response', btrim(p_response),
        'appeal_url', public.app_url() || '/appeal'
      )
    );
  end if;
end; $$;

-- -- 10) Grants (drops took the decide_appeal grant) --------------------------------------------------------------------

grant execute on function
  public.assert_valid_policy_code(text),
  public.claim_appeal(uuid),
  public.release_appeal(uuid),
  public.assign_appeal(uuid, uuid, text),
  public.add_appeal_note(uuid, text),
  public.request_appeal_second_review(uuid),
  public.get_admin_appeal_v2(uuid),
  public.list_appeals_page_v2(jsonb, integer, jsonb),
  public.decide_appeal(uuid, boolean, text, text, text, boolean)
  to authenticated;

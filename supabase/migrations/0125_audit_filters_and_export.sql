-- 0125_audit_filters_and_export.sql
-- Phase 7 of ADMIN_MODERATION_PRODUCTION_PLAN: make the audit log
-- operationally useful. Appeal actions get a first-class appeal_id column
-- (backfilled from metadata), and a filtered, keyset-paginated audit reader
-- replaces client-side filtering over loaded rows.

-- -- 1) First-class appeal reference --------------------------------------------------

alter table public.moderation_actions
  add column appeal_id uuid references public.appeals(id) on delete set null;

create index moderation_actions_appeal_idx
  on public.moderation_actions (appeal_id, created_at desc)
  where appeal_id is not null;

update public.moderation_actions ma
set appeal_id = (ma.metadata ->> 'appeal_id')::uuid
from public.appeals a
where ma.appeal_id is null
  and ma.metadata ? 'appeal_id'
  and (ma.metadata ->> 'appeal_id') ~ '^[0-9a-f-]{36}$'
  and a.id = (ma.metadata ->> 'appeal_id')::uuid;

-- -- 2) Appeal RPCs write the column (same signatures, grants survive) --------------------

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

  insert into public.moderation_actions (actor_id, appeal_id, action, reason, metadata)
  select v_actor, p_appeal_id, 'appeal_claimed', 'Appeal claimed', jsonb_build_object('appeal_id', p_appeal_id)
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

  insert into public.moderation_actions (actor_id, appeal_id, action, reason, metadata)
  values (v_actor, p_appeal_id, 'appeal_released', 'Appeal released', jsonb_build_object('appeal_id', p_appeal_id));
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

  insert into public.moderation_actions (actor_id, appeal_id, action, reason, metadata)
  values (v_actor, p_appeal_id, 'appeal_assigned', p_reason,
    jsonb_build_object('appeal_id', p_appeal_id, 'assignee', p_assignee));
end; $$;

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

  insert into public.moderation_actions (actor_id, appeal_id, action, reason, metadata)
  values (v_actor, p_appeal_id, 'appeal_note_added', 'Appeal note added', jsonb_build_object('appeal_id', p_appeal_id));
end; $$;

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

  insert into public.moderation_actions (actor_id, appeal_id, action, reason, metadata)
  values (v_actor, p_appeal_id, 'appeal_second_review_requested', 'Second review requested',
    jsonb_build_object('appeal_id', p_appeal_id));
end; $$;

create or replace function public.decide_appeal(
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

  insert into public.moderation_actions (actor_id, target_user_id, appeal_id, reason, action, metadata)
  values (v_actor,
          v_appeal.user_id,
          p_appeal_id,
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

-- -- 3) Filtered audit reader -----------------------------------------------------------------------
-- p_filters: action, actor_id, target_id, report_id, appeal_id, date_from,
-- date_to, search. Newest-first keyset on (created_at, id).

create or replace function public.get_moderation_audit_v2(
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 100,
  p_cursor jsonb default null
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
  post_id uuid,
  comment_id uuid,
  appeal_id uuid,
  action public.moderation_action_type,
  reason text,
  metadata jsonb
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_action public.moderation_action_type;
  v_actor uuid;
  v_target uuid;
  v_report uuid;
  v_appeal uuid;
  v_from timestamptz;
  v_to timestamptz;
  v_search text;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_limit integer;
begin
  perform public.assert_can_manage_roles();

  v_action := nullif(p_filters ->> 'action', '')::public.moderation_action_type;
  v_actor := nullif(p_filters ->> 'actor_id', '')::uuid;
  v_target := nullif(p_filters ->> 'target_id', '')::uuid;
  v_report := nullif(p_filters ->> 'report_id', '')::uuid;
  v_appeal := nullif(p_filters ->> 'appeal_id', '')::uuid;
  v_from := nullif(p_filters ->> 'date_from', '')::timestamptz;
  v_to := nullif(p_filters ->> 'date_to', '')::timestamptz;
  v_search := nullif(p_filters ->> 'search', '');
  v_cursor_at := nullif(p_cursor ->> 'created_at', '')::timestamptz;
  v_cursor_id := nullif(p_cursor ->> 'id', '')::uuid;
  v_limit := greatest(1, least(coalesce(p_limit, 100), 200));

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
    a.post_id,
    a.comment_id,
    a.appeal_id,
    a.action,
    a.reason,
    a.metadata
  from public.moderation_actions a
  left join public.profiles act on act.id = a.actor_id
  left join public.profiles tgt on tgt.id = a.target_user_id
  where (v_action is null or a.action = v_action)
    and (v_actor is null or a.actor_id = v_actor)
    and (v_target is null or a.target_user_id = v_target)
    and (v_report is null or a.report_id = v_report)
    and (v_appeal is null or a.appeal_id = v_appeal)
    and (v_from is null or a.created_at >= v_from)
    and (v_to is null or a.created_at <= v_to)
    and (v_search is null or (
      coalesce(act.display_name, '') ilike '%' || public.escape_like_pattern(v_search) || '%' escape '\'
      or coalesce(tgt.display_name, '') ilike '%' || public.escape_like_pattern(v_search) || '%' escape '\'
      or coalesce(a.reason, '') ilike '%' || public.escape_like_pattern(v_search) || '%' escape '\'
      or a.action::text ilike '%' || public.escape_like_pattern(v_search) || '%' escape '\'
    ))
    and (
      v_cursor_at is null
      or (a.created_at, a.id) < (v_cursor_at, coalesce(v_cursor_id, a.id))
    )
  order by a.created_at desc, a.id desc
  limit v_limit;
end; $$;

grant execute on function
  public.get_moderation_audit_v2(jsonb, integer, jsonb)
  to authenticated;

grant execute on function
  public.get_moderation_audit_v2(jsonb, integer, jsonb)
  to service_role;

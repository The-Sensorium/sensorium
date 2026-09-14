-- 0128_restore_reopen_and_audit_policy.sql
-- EOL browser-pass findings (docs/ADMIN_MODERATION_EOL_TEST_PLAN.md):
--  1. Restore was unreachable: Hide closes the case, the UI unmounts
--     Restore (canAct requires open), and restore_post/restore_post_comment
--     reject closed reports via assert_post_report_actionable. Restores now
--     reopen closed reports to reviewing, assigned to the restorer (Decision
--     A: true reversal). Open-report restores keep exact prior semantics.
--  2. moderation_actions.policy_code was stored but invisible:
--     get_moderation_audit_v2 now returns it (DROP + CREATE is required
--     because the return type changes; grants are re-issued below).
-- Signatures are unchanged, so existing grants on the restore functions
-- survive (same pattern as 0125). The new reopen helper is internal-only
-- (called from security-definer restores), following the assert_* convention.

-- -- 1) Reopen helper ---------------------------------------------------------

create function public.reopen_report_as_reviewing(
  p_report_id uuid,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_status public.report_status;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();

  select status into v_status from public.reports where id = p_report_id;
  if v_status is null then raise exception 'report_not_found'; end if;
  if v_status in ('pending', 'reviewing') then raise exception 'report_not_closed'; end if;

  update public.reports
  set status = 'reviewing',
      assigned_to = v_actor,
      resolution_note = coalesce(p_note, resolution_note),
      reviewed_by = v_actor,
      reviewed_at = now(),
      last_activity_at = now(),
      updated_at = now()
  where id = p_report_id;
end; $$;

-- -- 2) restore_post: reopen closed reports ------------------------------------

create or replace function public.restore_post(
  p_post_id uuid,
  p_reason text,
  p_report_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
  v_report_status public.report_status;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;

  update public.posts
  set moderation_status = 'approved'
  where id = p_post_id and moderation_status is distinct from 'approved';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'post_not_found_or_not_hidden'; end if;

  insert into public.moderation_actions (actor_id, report_id, post_id, action, reason, metadata)
  values (v_actor, p_report_id, p_post_id, 'post_restored', p_reason, jsonb_build_object('hidden', false));

  if p_report_id is not null then
    select status into v_report_status from public.reports where id = p_report_id;
    if v_report_status is null then raise exception 'report_not_found'; end if;
    if v_report_status in ('pending', 'reviewing') then
      perform public.assert_post_report_actionable(p_report_id, p_post_id);
      perform public.close_post_report_as_actioned(p_report_id, p_reason, p_post_id);
    else
      perform public.reopen_report_as_reviewing(p_report_id, p_reason);
    end if;
  end if;
end; $$;

-- -- 3) restore_post_comment: reopen closed reports -----------------------------

create or replace function public.restore_post_comment(
  p_comment_id uuid,
  p_reason text,
  p_report_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
  v_report_status public.report_status;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;

  update public.post_comments
  set moderation_status = 'approved'
  where id = p_comment_id and moderation_status is distinct from 'approved';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'comment_not_found_or_not_hidden'; end if;

  insert into public.moderation_actions (actor_id, report_id, comment_id, action, reason, metadata)
  values (v_actor, p_report_id, p_comment_id, 'post_comment_restored', p_reason, jsonb_build_object('hidden', false));

  if p_report_id is not null then
    select status into v_report_status from public.reports where id = p_report_id;
    if v_report_status is null then raise exception 'report_not_found'; end if;
    if v_report_status in ('pending', 'reviewing') then
      perform public.assert_post_report_actionable(p_report_id, null, p_comment_id);
      perform public.close_post_report_as_actioned(p_report_id, p_reason, null, p_comment_id);
    else
      perform public.reopen_report_as_reviewing(p_report_id, p_reason);
    end if;
  end if;
end; $$;

-- -- 4) restore_message needs no RPC change: it never asserted the report ----
-- (0054) and hide_message never closes the case, so restores stay valid in
-- every case state. Only the UI gate changes (EvidencePanel canRestore).

-- -- 5) Audit RPC returns policy_code ------------------------------------------
-- Return-type change requires DROP + CREATE; re-issue the 0125 grants.

drop function public.get_moderation_audit_v2(jsonb, integer, jsonb);

create function public.get_moderation_audit_v2(
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
  metadata jsonb,
  policy_code text
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
    a.metadata,
    a.policy_code
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

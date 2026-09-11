-- 0123_case_v2_target_user.sql
-- get_moderation_case_v2 never selected reports.target_user_id, so the case
-- UI could not gate enforcement actions on a known target (the account action
-- section silently never rendered). Adds the column; everything else unchanged.

drop function public.get_moderation_case_v2(uuid);

create function public.get_moderation_case_v2(p_report_id uuid)
returns table (
  id uuid,
  cluster_id uuid,
  cluster_name text,
  reason public.report_reason,
  details text,
  target_kind text,
  target_user_id uuid,
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
  target jsonb,
  post jsonb,
  comment jsonb
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
    r.target_user_id,
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
    where t.id = r.target_user_id),
    (select jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'content', p.content,
      'image_path', p.image_url,
      'gif_url', p.gif_url,
      'author_id', p.author_id,
      'author_display_name', pa.display_name,
      'cluster_id', p.cluster_id,
      'cluster_name', pc.name,
      'moderation_status', p.moderation_status,
      'deleted_at', p.deleted_at,
      'created_at', p.created_at
    )
    from public.posts p
    left join public.profiles pa on pa.id = p.author_id
    left join public.clusters pc on pc.id = p.cluster_id
    where p.id = r.post_id),
    (select jsonb_build_object(
      'id', cm.id,
      'content', cm.content,
      'image_path', cm.image_url,
      'gif_url', cm.gif_url,
      'author_id', cm.author_id,
      'author_display_name', ca.display_name,
      'post_id', cm.post_id,
      'post_title', pp.title,
      'post_snippet', left(coalesce(pp.content, ''), 140),
      'moderation_status', cm.moderation_status,
      'deleted_at', cm.deleted_at,
      'created_at', cm.created_at
    )
    from public.post_comments cm
    left join public.profiles ca on ca.id = cm.author_id
    left join public.posts pp on pp.id = cm.post_id
    where cm.id = r.comment_id)
  from public.reports r
  left join public.clusters c on c.id = r.cluster_id
  left join public.profiles ap on ap.id = r.assigned_to
  where r.id = p_report_id;
end; $$;

grant execute on function
  public.get_moderation_case_v2(uuid)
  to authenticated;

grant execute on function
  public.get_moderation_case_v2(uuid)
  to service_role;

-- -- 2) Notes stay writable after resolution -------------------------------------------
-- Enforcement closes the case in the same interaction that records the
-- rationale, so post-action notes must be allowed. Notes remain staff-only
-- and author-scoped; the timeline shows them alongside the action.

create or replace function public.add_moderation_case_note(p_report_id uuid, p_note text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_note_id uuid;
begin
  perform public.assert_can_moderate();
  if p_note is null or char_length(p_note) = 0 then
    raise exception 'note_required';
  end if;
  if char_length(p_note) > 2000 then
    raise exception 'note_too_long';
  end if;

  if not exists (select 1 from public.reports where id = p_report_id) then
    raise exception 'report_not_found';
  end if;

  insert into public.moderation_case_notes (report_id, author_id, note)
  values (p_report_id, v_actor, p_note)
  returning id into v_note_id;

  insert into public.moderation_actions (actor_id, report_id, action, reason, metadata)
  values (v_actor, p_report_id, 'note_added', 'Case note added',
    jsonb_build_object('note_id', v_note_id));

  return v_note_id;
end; $$;

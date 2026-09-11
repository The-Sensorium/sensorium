-- 0117_moderation_severity_and_queue_v2.sql
-- Phase 1 of ADMIN_MODERATION_PRODUCTION_PLAN: triage-ready queue + staff dashboard.
-- Adds severity/priority/SLA columns to reports, backfills them from reason, keeps
-- new rows triaged via trigger, and exposes two staff-only RPCs:
--   get_staff_moderation_summary() -> operational counts for the dashboard
--   get_moderation_queue_v2(p_filters, p_limit, p_cursor) -> filtered keyset queue
-- Old get_moderation_queue is left untouched until the V2 UI is stable.

-- -- 1) Enum + columns ---------------------------------------------------------

create type public.moderation_severity as enum ('low', 'medium', 'high', 'urgent');

alter table public.reports
  add column severity public.moderation_severity not null default 'medium',
  add column priority_score integer not null default 0,
  add column due_at timestamptz,
  add column last_activity_at timestamptz not null default now(),
  add column escalated_at timestamptz,
  add column escalated_by uuid references public.profiles(id) on delete set null,
  add column escalation_reason text check (escalation_reason is null or char_length(escalation_reason) <= 2000);

create index reports_severity_idx on public.reports (severity) where status in ('pending', 'reviewing');
create index reports_due_at_idx on public.reports (due_at) where status in ('pending', 'reviewing') and due_at is not null;
create index reports_last_activity_idx on public.reports (last_activity_at desc);

-- -- 2) Triage mapping ----------------------------------------------------------

create or replace function public.moderation_severity_for_reason(p_reason public.report_reason)
returns public.moderation_severity
language sql immutable set search_path = public as $$
  select case p_reason
    when 'hate_speech' then 'high'::public.moderation_severity
    when 'harassment' then 'high'::public.moderation_severity
    when 'inappropriate_content' then 'medium'::public.moderation_severity
    when 'other' then 'medium'::public.moderation_severity
    else 'low'::public.moderation_severity
  end;
$$;

create or replace function public.moderation_priority_for_severity(p_severity public.moderation_severity)
returns integer
language sql immutable set search_path = public as $$
  select case p_severity
    when 'urgent' then 100
    when 'high' then 75
    when 'medium' then 50
    else 25
  end;
$$;

create or replace function public.moderation_sla_for_severity(p_severity public.moderation_severity)
returns interval
language sql immutable set search_path = public as $$
  select case p_severity
    when 'urgent' then interval '4 hours'
    when 'high' then interval '24 hours'
    when 'medium' then interval '72 hours'
    else interval '7 days'
  end;
$$;

-- Backfill existing rows from reason; due_at anchors on created_at so SLA age is honest.
update public.reports r
set severity = public.moderation_severity_for_reason(r.reason),
    priority_score = public.moderation_priority_for_severity(public.moderation_severity_for_reason(r.reason)),
    due_at = r.created_at + public.moderation_sla_for_severity(public.moderation_severity_for_reason(r.reason)),
    last_activity_at = coalesce(r.updated_at, r.created_at, now())
where r.severity = 'medium' and r.priority_score = 0 and r.due_at is null;

-- New reports get triaged on insert even though report_member/report_post RPCs
-- do not pass severity explicitly.
create or replace function public.triage_report_on_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  NEW.severity := public.moderation_severity_for_reason(NEW.reason);
  NEW.priority_score := public.moderation_priority_for_severity(NEW.severity);
  if NEW.due_at is null then
    NEW.due_at := coalesce(NEW.created_at, now()) + public.moderation_sla_for_severity(NEW.severity);
  end if;
  if NEW.last_activity_at is null then
    NEW.last_activity_at := coalesce(NEW.created_at, now());
  end if;
  return NEW;
end; $$;

drop trigger if exists reports_triage_on_insert on public.reports;
create trigger reports_triage_on_insert
  before insert on public.reports
  for each row execute function public.triage_report_on_insert();

create or replace function public.touch_report_activity()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  NEW.last_activity_at := now();
  NEW.updated_at := now();
  return NEW;
end; $$;

drop trigger if exists reports_touch_activity on public.reports;
create trigger reports_touch_activity
  before update on public.reports
  for each row
  when (OLD.* is distinct from NEW.*)
  execute function public.touch_report_activity();

-- -- 3) Staff dashboard summary --------------------------------------------------

create or replace function public.get_staff_moderation_summary()
returns table (
  pending_count integer,
  reviewing_count integer,
  assigned_to_me_count integer,
  unassigned_open_count integer,
  oldest_pending_at timestamptz,
  breached_open_count integer,
  urgent_open_count integer,
  actioned_7d_count integer,
  dismissed_7d_count integer,
  appeals_submitted_count integer,
  reports_by_reason jsonb
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  perform public.assert_can_moderate();

  return query
  with open_reports as (
    select r.status, r.assigned_to, r.created_at, r.due_at, r.severity, r.reason
    from public.reports r
    where r.status in ('pending', 'reviewing')
  )
  select
    (select count(*)::int from open_reports where status = 'pending'),
    (select count(*)::int from open_reports where status = 'reviewing'),
    (select count(*)::int from open_reports where assigned_to = v_me),
    (select count(*)::int from open_reports where assigned_to is null),
    (select min(created_at) from open_reports where status = 'pending'),
    (select count(*)::int from open_reports where due_at is not null and due_at < now()),
    (select count(*)::int from open_reports where severity = 'urgent'),
    (select count(*)::int from public.reports where status = 'actioned' and created_at > now() - interval '7 days'),
    (select count(*)::int from public.reports where status = 'dismissed' and created_at > now() - interval '7 days'),
    case when public.can_manage_roles(v_me)
      then (select count(*)::int from public.appeals where status = 'submitted')
      else 0
    end,
    coalesce(
      (select jsonb_object_agg(reason, cnt) from (
        select reason::text as reason, count(*)::int as cnt from open_reports group by reason
      ) s),
      '{}'::jsonb
    );
end; $$;

-- -- 4) Queue V2 ------------------------------------------------------------------
-- p_filters keys: status, assignee (all|unassigned|mine|<uuid>), target_kind
-- (member|message|post|comment), reason, severity, sla (breached|open|closed|all),
-- search, date_from, date_to, order (asc|desc).
-- p_cursor: {created_at, id} keyset on created_at+id.

create or replace function public.get_moderation_queue_v2(
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 25,
  p_cursor jsonb default null
)
returns table (
  id uuid,
  cluster_id uuid,
  cluster_name text,
  reporter_display_name text,
  target_user_id uuid,
  target_display_name text,
  reason public.report_reason,
  severity public.moderation_severity,
  priority_score integer,
  status public.report_status,
  assigned_to uuid,
  assigned_to_display_name text,
  created_at timestamptz,
  due_at timestamptz,
  last_activity_at timestamptz,
  target_kind text,
  snippet text,
  message_id uuid,
  post_id uuid,
  comment_id uuid,
  duplicate_open_reports integer,
  prior_target_reports integer
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_status public.report_status;
  v_assignee text;
  v_kind text;
  v_reason public.report_reason;
  v_severity public.moderation_severity;
  v_sla text;
  v_search text;
  v_from timestamptz;
  v_to timestamptz;
  v_order text := 'desc';
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_limit integer;
begin
  perform public.assert_can_moderate();

  v_status := nullif(p_filters ->> 'status', '')::public.report_status;
  v_assignee := coalesce(nullif(p_filters ->> 'assignee', ''), 'all');
  v_kind := nullif(p_filters ->> 'target_kind', '');
  v_reason := nullif(p_filters ->> 'reason', '')::public.report_reason;
  v_severity := nullif(p_filters ->> 'severity', '')::public.moderation_severity;
  v_sla := coalesce(nullif(p_filters ->> 'sla', ''), 'all_open');
  v_search := nullif(p_filters ->> 'search', '');
  v_from := nullif(p_filters ->> 'date_from', '')::timestamptz;
  v_to := nullif(p_filters ->> 'date_to', '')::timestamptz;
  if coalesce(p_filters ->> 'order', 'desc') in ('asc', 'desc') then
    v_order := p_filters ->> 'order';
  end if;
  v_cursor_at := nullif(p_cursor ->> 'created_at', '')::timestamptz;
  v_cursor_id := nullif(p_cursor ->> 'id', '')::uuid;
  v_limit := greatest(1, least(coalesce(p_limit, 25), 100));

  return query
  select
    r.id,
    r.cluster_id,
    c.name,
    rp.display_name,
    r.target_user_id,
    t.display_name,
    r.reason,
    r.severity,
    r.priority_score,
    r.status,
    r.assigned_to,
    ap.display_name,
    r.created_at,
    r.due_at,
    r.last_activity_at,
    case
      when r.post_id is not null then 'post'
      when r.comment_id is not null then 'comment'
      when r.message_id is not null then 'message'
      else 'member'
    end,
    left(coalesce(r.details, ''), 140),
    r.message_id,
    r.post_id,
    r.comment_id,
    (select count(*)::int from public.reports d
      where d.id <> r.id and d.status in ('pending', 'reviewing')
        and ((d.target_user_id = r.target_user_id and r.target_user_id is not null)
          or (d.message_id = r.message_id and r.message_id is not null)
          or (d.post_id = r.post_id and r.post_id is not null)
          or (d.comment_id = r.comment_id and r.comment_id is not null))),
    (select count(*)::int from public.reports h
      where h.target_user_id = r.target_user_id and h.id <> r.id and r.target_user_id is not null)
  from public.reports r
  join public.clusters c on c.id = r.cluster_id
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles t on t.id = r.target_user_id
  left join public.profiles ap on ap.id = r.assigned_to
  where (v_status is null or r.status = v_status)
    and (v_reason is null or r.reason = v_reason)
    and (v_severity is null or r.severity = v_severity)
    and (
      case v_sla
        when 'breached' then (r.status in ('pending', 'reviewing') and r.due_at is not null and r.due_at < now())
        when 'open' then (r.status in ('pending', 'reviewing'))
        when 'closed' then (r.status in ('actioned', 'dismissed'))
        when 'all' then true
        else (r.status in ('pending', 'reviewing'))
      end
    )
    and (
      case v_assignee
        when 'all' then true
        when 'unassigned' then r.assigned_to is null and r.status in ('pending', 'reviewing')
        when 'mine' then r.assigned_to = v_me
        else r.assigned_to = nullif(v_assignee, '')::uuid
      end
    )
    and (v_kind is null or
      case
        when r.post_id is not null then 'post'
        when r.comment_id is not null then 'comment'
        when r.message_id is not null then 'message'
        else 'member'
      end = v_kind)
    and (v_from is null or r.created_at >= v_from)
    and (v_to is null or r.created_at <= v_to)
    and (v_search is null or (
      coalesce(t.display_name, '') ilike '%' || v_search || '%'
      or coalesce(rp.display_name, '') ilike '%' || v_search || '%'
      or coalesce(c.name, '') ilike '%' || v_search || '%'
      or coalesce(r.details, '') ilike '%' || v_search || '%'
    ))
    and (
      v_cursor_at is null
      or (v_order = 'asc' and (r.created_at, r.id) > (v_cursor_at, coalesce(v_cursor_id, r.id)))
      or (v_order = 'desc' and (r.created_at, r.id) < (v_cursor_at, coalesce(v_cursor_id, r.id)))
    )
  order by
    case when v_order = 'desc' then r.created_at end desc,
    case when v_order = 'desc' then r.id end desc,
    case when v_order = 'asc' then r.created_at end asc,
    case when v_order = 'asc' then r.id end asc
  limit v_limit;
end; $$;

grant execute on function
  public.moderation_severity_for_reason(public.report_reason),
  public.moderation_priority_for_severity(public.moderation_severity),
  public.moderation_sla_for_severity(public.moderation_severity),
  public.get_staff_moderation_summary(),
  public.get_moderation_queue_v2(jsonb, integer, jsonb)
  to authenticated;

grant execute on function
  public.get_staff_moderation_summary(),
  public.get_moderation_queue_v2(jsonb, integer, jsonb)
  to service_role;

-- 0126_moderation_rate_limits_sla_ops.sql
-- Phase 8 of ADMIN_MODERATION_PRODUCTION_PLAN: abuse prevention, SLA
-- alerting, and ops health. Rate limits live in BEFORE INSERT triggers so
-- every writer (member RPCs, future paths) is covered without touching the
-- report/appeal RPC bodies. A cron job surfaces SLA breaches to staff, and an
-- admin-only health RPC exposes outbox + scheduler state.

-- -- 1) Rate limits ------------------------------------------------------------------------
-- 10 reports per account per hour; 3 appeals per account per 24 hours.
-- Anonymized rows (null reporter/user) are never limited.

create or replace function public.check_report_rate_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.reporter_id is null then
    return NEW;
  end if;
  if (select count(*) from public.reports
      where reporter_id = NEW.reporter_id
        and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'report_rate_limited';
  end if;
  return NEW;
end; $$;

drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function public.check_report_rate_limit();

create or replace function public.check_appeal_rate_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.user_id is null then
    return NEW;
  end if;
  if (select count(*) from public.appeals
      where user_id = NEW.user_id
        and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'appeal_rate_limited';
  end if;
  return NEW;
end; $$;

drop trigger if exists appeals_rate_limit on public.appeals;
create trigger appeals_rate_limit
  before insert on public.appeals
  for each row execute function public.check_appeal_rate_limit();

-- -- 2) SLA breach detection --------------------------------------------------------------------
-- Marks newly breached open reports and badges moderators through the
-- existing report_new channel with an sla_breach payload flag.

alter table public.reports
  add column sla_breach_notified_at timestamptz;

create or replace function public.detect_moderation_sla_breaches()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select r.id, r.cluster_id, r.reason, r.target_user_id, r.due_at
    from public.reports r
    where r.status in ('pending', 'reviewing')
      and r.due_at is not null
      and r.due_at < now()
      and r.sla_breach_notified_at is null
    order by r.due_at asc, r.id asc
    limit 50
  loop
    update public.reports
    set sla_breach_notified_at = now()
    where id = v_row.id;

    perform public.notify_staff(
      'report_new',
      v_row.cluster_id,
      'SLA breached: ' || replace(v_row.reason::text, '_', ' '),
      (select display_name from public.profiles where id = v_row.target_user_id),
      jsonb_build_object(
        'report_id', v_row.id,
        'reason', v_row.reason::text,
        'target_user_id', v_row.target_user_id,
        'sla_breach', true
      ),
      false,
      null
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end; $$;

select cron.unschedule('moderation-sla-watch')
where exists (select 1 from cron.job where jobname = 'moderation-sla-watch');
select cron.schedule('moderation-sla-watch', '*/15 * * * *', $$select public.detect_moderation_sla_breaches()$$);

-- -- 3) Admin ops health ------------------------------------------------------------------------------
-- Counts only, never payloads or secrets. Cron heartbeats degrade to null
-- where the scheduler schema is not visible.

create or replace function public.get_admin_ops_health()
returns table (
  email_queued integer,
  email_stuck_sending integer,
  email_failed_24h integer,
  email_abandoned integer,
  push_queued integer,
  push_stuck_sending integer,
  push_failed_24h integer,
  push_abandoned integer,
  reports_breached_open integer,
  appeals_overdue_open integer,
  last_email_pump_at timestamptz,
  last_push_pump_at timestamptz,
  last_sla_watch_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_email_pump timestamptz;
  v_push_pump timestamptz;
  v_sla_watch timestamptz;
begin
  perform public.assert_can_manage_roles();

  begin
    select max(end_time) into v_email_pump
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'email-pump' and d.status = 'succeeded';
    select max(end_time) into v_push_pump
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'push-pump' and d.status = 'succeeded';
    select max(end_time) into v_sla_watch
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'moderation-sla-watch' and d.status = 'succeeded';
  exception when others then
    v_email_pump := null;
    v_push_pump := null;
    v_sla_watch := null;
  end;

  return query
  select
    (select count(*)::int from public.outbound_emails where status = 'queued'),
    (select count(*)::int from public.outbound_emails
      where status = 'sending' and updated_at < now() - interval '2 minutes'),
    (select count(*)::int from public.outbound_emails
      where status = 'failed' and created_at > now() - interval '24 hours'),
    (select count(*)::int from public.outbound_emails where status = 'abandoned'),
    (select count(*)::int from public.push_outbox where status = 'queued'),
    (select count(*)::int from public.push_outbox
      where status = 'sending' and updated_at < now() - interval '2 minutes'),
    (select count(*)::int from public.push_outbox
      where status = 'failed' and created_at > now() - interval '24 hours'),
    (select count(*)::int from public.push_outbox where status = 'abandoned'),
    (select count(*)::int from public.reports
      where status in ('pending', 'reviewing') and due_at is not null and due_at < now()),
    (select count(*)::int from public.appeals
      where status = 'submitted' and review_due_at is not null and review_due_at < now()),
    v_email_pump,
    v_push_pump,
    v_sla_watch;
end; $$;

grant execute on function
  public.detect_moderation_sla_breaches(),
  public.get_admin_ops_health()
  to authenticated;

grant execute on function
  public.detect_moderation_sla_breaches(),
  public.get_admin_ops_health()
  to service_role;

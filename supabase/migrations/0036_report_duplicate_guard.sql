-- 0036_report_duplicate_guard.sql
-- Prevent a member from spamming unlimited reports against the same target:
-- while an earlier report is still open (pending/reviewing), a new one from
-- the same reporter to the same target is rejected. Replaces report_member
-- (0025). Idempotent via db reset.

create or replace function public.report_member(
  p_cluster_id uuid,
  p_target_user_id uuid,
  p_reason public.report_reason,
  p_details text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reporter_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_reporter_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_reporter_id = p_target_user_id then
    raise exception 'cannot_report_self';
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

  if exists (
    select 1 from public.reports
    where reporter_id = v_reporter_id
      and target_user_id = p_target_user_id
      and status in ('pending', 'reviewing')
  ) then
    raise exception 'duplicate_report';
  end if;

  insert into public.reports (cluster_id, reporter_id, target_user_id, reason, details)
  values (p_cluster_id, v_reporter_id, p_target_user_id, p_reason, p_details)
  returning id into v_report_id;

  return v_report_id;
end;
$$;

grant execute on function public.report_member(uuid, uuid, public.report_reason, text) to authenticated;

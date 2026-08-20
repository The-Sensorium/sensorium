-- 0057_drop_report_member_overload.sql
-- Migration B recreated report_member with an optional p_message_id (5-arg)
-- using `create or replace`, which cannot replace the pre-existing 4-arg
-- signature. PostgREST then sees two candidates whenever a client omits
-- p_message_id and rejects every ordinary member report as ambiguous. Drop the
-- stale signature so the validated 5-arg version is the only candidate.

drop function public.report_member(
  p_cluster_id uuid,
  p_target_user_id uuid,
  p_reason public.report_reason,
  p_details text
);
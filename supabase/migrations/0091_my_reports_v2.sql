-- 0091_my_reports_v2.sql
-- Reporter-facing status query. Replaces the 0053 get_my_reports() shape,
-- which predates post/comment reports and exposes no cluster name or target
-- kind. Returns status only: never staff identity, notes, or action detail.

create function public.get_my_reports_v2()
returns table (
  id uuid,
  cluster_id uuid,
  cluster_name text,
  target_kind text,
  reason public.report_reason,
  status public.report_status,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    r.id,
    r.cluster_id,
    c.name,
    case
      when r.comment_id is not null then 'comment'
      when r.post_id is not null then 'post'
      when r.message_id is not null then 'message'
      else 'member'
    end,
    r.reason,
    r.status,
    r.created_at
  from public.reports r
  join public.clusters c on c.id = r.cluster_id
  where r.reporter_id = auth.uid()
  order by r.created_at desc;
$$;

grant execute on function public.get_my_reports_v2() to authenticated;
grant execute on function public.get_my_reports_v2() to service_role;

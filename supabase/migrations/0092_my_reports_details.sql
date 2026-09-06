-- 0092_my_reports_details.sql
-- My Reports rows gain the report target's display name and the reporter's own
-- submitted details, so multiple reports are distinguishable. Still status-only:
-- never staff identity, notes, or action detail.

drop function public.get_my_reports_v2();

create function public.get_my_reports_v2()
returns table (
  id uuid,
  cluster_id uuid,
  cluster_name text,
  target_kind text,
  target_display_name text,
  reason public.report_reason,
  details text,
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
    t.display_name,
    r.reason,
    r.details,
    r.status,
    r.created_at
  from public.reports r
  join public.clusters c on c.id = r.cluster_id
  left join public.profiles t on t.id = r.target_user_id
  where r.reporter_id = auth.uid()
  order by r.created_at desc;
$$;

grant execute on function public.get_my_reports_v2() to authenticated;
grant execute on function public.get_my_reports_v2() to service_role;

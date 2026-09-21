-- 0152 - Cap get_cluster_activity at 500 rows.
-- Each row runs correlated member/message counts, so an unbounded p_limit is
-- an expensive scan for the price of one RPC argument. The UI pages 50-500
-- and never asks for more; the cap is defense in depth for any future caller.
-- Signature unchanged, so create or replace keeps the 0148 grant.
create or replace function public.get_cluster_activity(p_limit int default 50)
returns table (
  cluster_id uuid,
  name text,
  mode public.matching_mode,
  active_members int,
  messages_30d int,
  last_message_day date
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_can_manage_roles();
  return query
  select c.id, c.name, c.matching_mode,
    (select count(*)::int from public.cluster_members cm
      where cm.cluster_id = c.id and cm.left_at is null),
    (select count(*)::int from public.messages m
      where m.cluster_id = c.id and m.created_at > now() - interval '30 days'),
    (select max(m.created_at)::date from public.messages m
      where m.cluster_id = c.id)
  from public.clusters c
  where c.status = 'active'
  order by 5 desc
  limit least(greatest(p_limit, 1), 500);
end; $$;

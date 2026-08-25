-- 0089_queue_order.sql
-- Adds a sort-direction option to the two staff queue readers so the Reports
-- and Appeals tabs can each be toggled between oldest-first and newest-first,
-- keeping the staff workspace consistent. Both default to newest-first (desc).
--
--   get_moderation_queue  -> p_order ('asc' | 'desc', default 'desc')
--   list_appeals_page     -> p_order ('asc' | 'desc', default 'desc')
--
-- Ordering and cursor comparison flip together: for keyset pagination the
-- boundary predicate is `>` when ascending and `<` when descending. The ORDER BY
-- uses both directions via CASE so every row picks one (the other pair is NULL,
-- which sorts as a no-op tie-break).

-- Drop the previous fixed-order signatures so the new p_order variants don't
-- become PostgREST-ambiguous overloads (adding a param via `create or replace`
-- only replaces if the signature matches).
drop function public.get_moderation_queue(public.report_status, uuid, integer, timestamptz, uuid);
drop function public.list_appeals_page(public.appeal_status, integer, integer);

create or replace function public.get_moderation_queue(
  p_status public.report_status default null,
  p_assigned_to uuid default null,
  p_limit integer default 50,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_order text default 'desc'
)
returns table (
  id uuid,
  cluster_id uuid,
  cluster_name text,
  target_user_id uuid,
  target_display_name text,
  reason public.report_reason,
  details text,
  message_id uuid,
  status public.report_status,
  assigned_to uuid,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_moderate();
  if p_order is null or p_order not in ('asc', 'desc') then
    p_order := 'desc';
  end if;

  return query
    select
      r.id,
      r.cluster_id,
      c.name,
      r.target_user_id,
      t.display_name,
      r.reason,
      r.details,
      r.message_id,
      r.status,
      r.assigned_to,
      r.created_at
    from public.reports r
    join public.clusters c on c.id = r.cluster_id
    left join public.profiles t on t.id = r.target_user_id
    where (p_status is null or r.status = p_status)
      and (p_assigned_to is null or r.assigned_to = p_assigned_to)
      and (
        p_cursor_created_at is null
        or (p_order = 'asc' and (r.created_at, r.id) > (p_cursor_created_at, coalesce(p_cursor_id, r.id)))
        or (p_order = 'desc' and (r.created_at, r.id) < (p_cursor_created_at, coalesce(p_cursor_id, r.id)))
      )
    order by
      case when p_order = 'desc' then r.created_at end desc,
      case when p_order = 'desc' then r.id end desc,
      case when p_order = 'asc' then r.created_at end asc,
      case when p_order = 'asc' then r.id end asc
    limit greatest(1, least(p_limit, 100));
end; $$;

create or replace function public.list_appeals_page(
  p_status public.appeal_status default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_order text default 'desc'
)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  appealed_status public.account_status,
  appealed_reason text,
  details text,
  status public.appeal_status,
  response text,
  created_at timestamptz,
  decided_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  -- Mirror get_moderation_queue: an invalid p_order would otherwise yield
  -- all-NULL sort keys (via the CASE) and an arbitrary, unstable row order.
  if p_order is null or p_order not in ('asc', 'desc') then
    p_order := 'desc';
  end if;

  return query
    select
      a.id,
      a.user_id,
      p.display_name,
      a.appealed_status,
      a.appealed_reason,
      a.details,
      a.status,
      a.response,
      a.created_at,
      a.decided_at
    from public.appeals a
    left join public.profiles p on p.id = a.user_id
    where public.can_manage_roles(auth.uid())
      and (p_status is null or a.status = p_status)
    order by
      case when p_order = 'asc' then a.created_at end asc,
      case when p_order = 'asc' then a.id end asc,
      case when p_order = 'desc' then a.created_at end desc,
      case when p_order = 'desc' then a.id end desc
    limit greatest(1, least(p_limit, 100))
    offset greatest(0, p_offset);
end; $$;

-- Re-grant the new signatures (the old ones were dropped with their grants).
grant execute on function
  public.get_moderation_queue(public.report_status, uuid, integer, timestamptz, uuid, text),
  public.list_appeals_page(public.appeal_status, integer, integer, text)
  to authenticated;

-- 0061_paginated_platform_roles.sql
-- Paginated, searchable role assignments for the admin management table.

create function public.list_platform_roles_page(
  p_role public.platform_role default null,
  p_include_revoked boolean default false,
  p_query text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  email text,
  role public.platform_role,
  granted_by uuid,
  granted_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  grant_reason text,
  total_count bigint
)
language plpgsql security definer set search_path = public as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
begin
  perform public.assert_can_manage_roles();

  return query
    select
      r.id,
      r.user_id,
      p.display_name,
      p.email,
      r.role,
      r.granted_by,
      r.granted_at,
      r.revoked_by,
      r.revoked_at,
      r.grant_reason,
      count(*) over () as total_count
    from public.user_roles r
    left join public.profiles p on p.id = r.user_id
    where (p_role is null or r.role = p_role)
      and (p_include_revoked or r.revoked_at is null)
      and (
        v_query = ''
        or position(v_query in lower(coalesce(p.display_name, ''))) > 0
        or position(v_query in lower(coalesce(p.email, ''))) > 0
        or position(v_query in lower(coalesce(r.grant_reason, ''))) > 0
      )
    order by r.revoked_at is not null asc, p.display_name asc nulls last, r.granted_at desc
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    offset greatest(0, coalesce(p_offset, 0));
end; $$;

grant execute on function public.list_platform_roles_page(public.platform_role, boolean, text, integer, integer)
  to authenticated;

grant execute on function public.list_platform_roles_page(public.platform_role, boolean, text, integer, integer)
  to service_role;

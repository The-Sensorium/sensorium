-- 0060_search_accounts.sql
-- Admin-only account search for the role-management autocomplete. The query is
-- intentionally bounded and returns only the fields needed to identify a user.

create function public.search_accounts(p_query text)
returns table (
  user_id uuid,
  display_name text,
  email text
)
language plpgsql security definer set search_path = public as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
begin
  perform public.assert_can_manage_roles();
  if char_length(v_query) < 2 then
    return;
  end if;

  return query
    select p.id, p.display_name, p.email
    from public.profiles p
    where position(v_query in lower(p.email)) > 0
       or position(v_query in lower(p.display_name)) > 0
    order by
      case when lower(p.email) = v_query then 0 else 1 end,
      p.display_name asc,
      p.email asc
    limit 8;
end; $$;

grant execute on function public.search_accounts(text)
  to authenticated;

grant execute on function public.search_accounts(text)
  to service_role;

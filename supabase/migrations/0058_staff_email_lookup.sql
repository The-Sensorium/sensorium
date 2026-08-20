-- 0058_staff_email_lookup.sql
-- Staff-facing email → profile-id lookup so the role-grant form can resolve a
-- target account without any direct table access (`profiles` RLS stays self-
-- only). Admin + AAL2 only; returns null when no account matches. The caller
-- owns the friendly "no account found" message, keeping the RPC dumb and safe.

create function public.get_user_id_by_email(p_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
begin
  perform public.assert_can_manage_roles();
  if p_email is null or char_length(trim(p_email)) = 0 then
    return null;
  end if;

  select id into v_user_id
  from public.profiles
  where email = lower(trim(p_email))
  limit 1;
  return v_user_id;
end; $$;

grant execute on function public.get_user_id_by_email(text)
  to authenticated;

grant execute on function public.get_user_id_by_email(text)
  to service_role;
-- 0059_remove_staff_mfa_requirement.sql
-- Staff authorization remains role- and account-status-based. MFA was not
-- exposed in the product UI, so it must not make staff actions unusable.

create or replace function public.assert_can_moderate()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_moderate(auth.uid()) then
    raise exception 'insufficient_permission';
  end if;
end; $$;

create or replace function public.assert_can_manage_roles()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_manage_roles(auth.uid()) then
    raise exception 'insufficient_permission';
  end if;
end; $$;

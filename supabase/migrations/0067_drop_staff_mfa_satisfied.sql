-- 0067_drop_staff_mfa_satisfied.sql
-- 0059 removed the staff MFA (AAL2) requirement and 0064 dropped
-- assert_staff_aal2, but get_my_access still returned staff_mfa_satisfied via
-- the public.jwt_has_aal2() helper. Nothing consumes either, so drop the
-- column and the now-unused helper together. The return shape changes, so the
-- function is dropped and recreated (0057 pattern) and its authenticated
-- grant from 0052 is re-applied.

drop function if exists public.get_my_access();

create function public.get_my_access()
returns table (
  user_id uuid,
  roles text[],
  available_session_roles text[],
  capabilities text[],
  account_status public.account_status,
  restriction_expires_at timestamptz,
  onboarding_completed boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_roles text[];
  v_capabilities text[];
  v_restriction public.account_restrictions%rowtype;
  v_status public.account_status;
  v_expires_at timestamptz;
  v_onboarding_completed boolean;
begin
  if v_user_id is null then
    return;
  end if;

  select array_agg(r.role::text order by r.role::text)
    into v_roles
  from public.user_roles r
  where r.user_id = v_user_id and r.revoked_at is null;
  v_roles := coalesce(v_roles, '{}'::text[]);

  v_capabilities := '{}'::text[];
  if v_roles && array['moderator', 'admin'] then
    v_capabilities := array_append(v_capabilities, 'can_moderate');
    v_capabilities := array_append(v_capabilities, 'can_apply_temporary_restriction');
  end if;
  if v_roles @> array['admin'] then
    v_capabilities := v_capabilities || array['can_manage_roles', 'can_apply_permanent_restriction', 'can_view_audit_log'];
  end if;

  select r.* into v_restriction
  from public.account_restrictions r
  where r.user_id = v_user_id;

  v_status := coalesce(v_restriction.status, 'active'::public.account_status);
  v_expires_at := v_restriction.expires_at;

  -- Mirrors is_account_active(): a lapsed suspension restores access
  -- immediately. The cron job clears the row, but the same judgment must hold
  -- in the window before it runs, or the UI guards disagree with the database
  -- write gate.
  if v_status = 'suspended' and v_expires_at is not null and v_expires_at <= now() then
    v_status := 'active';
    v_expires_at := null;
  end if;

  select p.onboarding_completed_at is not null into v_onboarding_completed
  from public.profiles p
  where p.id = v_user_id;

  return query select
    v_user_id,
    v_roles,
    array['member'::text] || v_roles,
    v_capabilities,
    v_status,
    v_expires_at,
    coalesce(v_onboarding_completed, false);
end; $$;

grant execute on function public.get_my_access() to authenticated;

drop function if exists public.jwt_has_aal2();
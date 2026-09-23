-- 0157_staff_optin_mfa_enforcement.sql
-- Opt-in MFA enforcement for staff (Supabase's "enforce only for users that
-- have opted-in" posture): a staff caller holding a verified TOTP factor must
-- present an AAL2 session. Staff with no enrolled factor keep working at AAL1,
-- so nobody is locked out by this migration. Members never reach these asserts.
--
-- Reads auth.mfa_factors from a security definer helper: RLS bodies run as the
-- caller and authenticated cannot read that table (Supabase issue #36024), so
-- a direct policy lookup would 403. The JWT aal claim stays the fast path.
--
-- Self-unenroll needs no extra gate: GoTrue rejects unenrolling a verified
-- factor from an AAL1 session, so dropping to AAL1-unenforced requires proving
-- possession of the factor first.

create function public.has_verified_totp_factor(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.mfa_factors
    where user_id = p_user_id
      and factor_type = 'totp'
      and status = 'verified'
  );
$$;

-- Check order preserves 0063 semantics: restricted accounts fail with
-- account_inactive before role or MFA is even considered.
create or replace function public.assert_can_moderate()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_account_active(auth.uid()) then
    raise exception 'account_inactive';
  end if;
  if not public.can_moderate(auth.uid()) then
    raise exception 'insufficient_permission';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
    and public.has_verified_totp_factor(auth.uid()) then
    raise exception 'staff_mfa_required';
  end if;
end; $$;

create or replace function public.assert_can_manage_roles()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_account_active(auth.uid()) then
    raise exception 'account_inactive';
  end if;
  if not public.can_manage_roles(auth.uid()) then
    raise exception 'insufficient_permission';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
    and public.has_verified_totp_factor(auth.uid()) then
    raise exception 'staff_mfa_required';
  end if;
end; $$;

revoke all on function public.has_verified_totp_factor(uuid) from public, anon;
grant execute on function public.has_verified_totp_factor(uuid) to authenticated;

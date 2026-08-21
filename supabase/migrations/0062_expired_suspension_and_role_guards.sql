-- 0062_expired_suspension_and_role_guards.sql
-- Follow-ups from a review of 0052–0061:
--
--   1. get_my_access now reports a lapsed suspension as `active`, exactly the
--      computation is_account_active() already uses to gate writes. Previously
--      the UI guards (RequireActiveAccount et al.) trusted the raw status and
--      kept the account locked behind /restricted after the window passed even
--      though the database allowed writes.
--   2. A pg_cron job lifts lapsed suspensions and records an audited
--      `suspension_lifted` row, so account_restrictions self-heals instead of
--      sitting on a stale `suspended` row.
--   3. revoke_platform_role gains the same cannot_revoke_self guard the grant,
--      restriction, and warning mutations already have.
--   4. The staff RPCs converted to raising asserting helpers in 0056 (and every
--      staff RPC added since) can never succeed from the unauthenticated
--      service_role context — that execute grant is revoked rather than left as
--      a misleading dead grant. The 0052 table grants for service_role stay.

-- -- 1) Effective account status -----------------------------------------------

create or replace function public.get_my_access()
returns table (
  user_id uuid,
  roles text[],
  available_session_roles text[],
  capabilities text[],
  account_status public.account_status,
  restriction_expires_at timestamptz,
  onboarding_completed boolean,
  staff_mfa_satisfied boolean
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
  -- immediately. The cron job below clears the row, but the same judgment must
  -- hold in the window before it runs, or the UI guards disagree with the
  -- database write gate.
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
    coalesce(v_onboarding_completed, false),
    public.jwt_has_aal2();
end; $$;

-- -- 2) Lapsed-suspension maintenance ------------------------------------------

create function public.lift_expired_suspensions()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
begin
  for v_row in
    select user_id
    from public.account_restrictions
    where status = 'suspended'
      and expires_at is not null
      and expires_at <= now()
  loop
    update public.account_restrictions
    set status = 'active'::public.account_status,
        expires_at = null,
        lifted_by = null,
        lifted_at = now()
    where user_id = v_row.user_id;

    insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
    values (null, v_row.user_id, 'suspension_lifted',
            'Suspension period ended', jsonb_build_object('auto_lifted', true));
  end loop;
end; $$;

select cron.schedule('suspension-expiry', '*/5 * * * *', $$select public.lift_expired_suspensions()$$);

-- -- 3) Self-demotion guard ----------------------------------------------------
-- Matches grant_platform_role (cannot_grant_self), apply_account_restriction
-- (cannot_restrict_self), and issue_warning (cannot_warn_self): an admin may
-- not use this RPC to revoke their own assignment.

create or replace function public.revoke_platform_role(
  p_user_id uuid,
  p_role public.platform_role,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  perform public.assert_can_manage_roles();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 500 then raise exception 'reason_too_long'; end if;

  if p_role = 'admin' and exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin' and revoked_at is null
  ) and not exists (
    select 1 from public.user_roles
    where role = 'admin' and revoked_at is null and user_id <> p_user_id
  ) then
    raise exception 'last_admin_required';
  end if;

  -- After the last-admin check: a sole administrator revoking themselves is
  -- reported as the more specific last-admin condition; otherwise self-revoke
  -- is refused outright.
  if p_user_id = v_actor then raise exception 'cannot_revoke_self'; end if;

  update public.user_roles
  set revoked_at = now(), revoked_by = v_actor
  where user_id = p_user_id and role = p_role and revoked_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'not_assigned'; end if;

  insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
  values (v_actor, p_user_id, 'role_revoked', p_reason,
          jsonb_build_object('role', p_role::text));
end; $$;

-- -- 4) Drop dead service_role grants on staff RPCs ----------------------------
-- Every staff RPC lower in the stack raises through assert_can_moderate /
-- assert_can_manage_roles, which reject a null auth.uid() with
-- `not_authenticated`. service_role sessions carry no JWT user, so these grants
-- stopped working when 0056 converted the functions to PL/pgSQL. Revoke them so
-- nobody wires backend tooling to a grant that can never succeed.
-- Member-facing RPCs (get_my_reports) and the 0052 table grants are untouched.

revoke execute on function
  public.get_moderation_queue(public.report_status, uuid, integer, timestamptz, uuid),
  public.get_moderation_report(uuid),
  public.get_moderation_message(uuid),
  public.claim_moderation_report(uuid),
  public.release_moderation_report(uuid),
  public.resolve_moderation_report(uuid, public.report_status, text, jsonb),
  public.hide_message(uuid, text, uuid),
  public.restore_message(uuid, text, uuid),
  public.apply_account_restriction(uuid, public.account_status, text, timestamptz),
  public.issue_warning(uuid, text),
  public.grant_platform_role(uuid, public.platform_role, text),
  public.revoke_platform_role(uuid, public.platform_role, text),
  public.list_platform_roles(public.platform_role, boolean),
  public.get_moderation_audit(integer, timestamptz, uuid),
  public.get_user_id_by_email(text),
  public.search_accounts(text),
  public.list_platform_roles_page(public.platform_role, boolean, text, integer, integer)
  from service_role;
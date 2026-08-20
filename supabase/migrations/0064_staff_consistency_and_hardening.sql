-- 0064_staff_consistency_and_hardening.sql
-- Follow-ups from the 0063 review:
--   1. The suspension *lift* branch (`p_status = 'active'` on a non-banned
--      target) only demanded `assert_can_moderate()`, so a moderator could
--      undo an admin's suspension of a staff member. Mirror the
--      `cannot_restrict_staff` guard: staff restrictions are admin-only.
--   2. The suspension *apply* branch only required an expiry for non-admins,
--      so an admin (or the admin ban->suspended downgrade) could create a
--      `suspended` row with NULL `expires_at` -- a permanent "soft ban" that
--      never lapses via is_account_active and never auto-lifts. Require an
--      expiry for every suspension; permanent removal is what `banned` is for.
--   3. `assert_staff_aal2` has been dead code since 0059 removed the MFA
--      requirement (0059 redefined both asserting helpers without calling it).
--      Drop it and its authenticated grant; `jwt_has_aal2` stays (still used
--      by get_my_access).

-- -- 1) Lift/apply consistency for staff restrictions -------------------------

create or replace function public.apply_account_restriction(
  p_user_id uuid,
  p_status public.account_status,
  p_reason text,
  p_expires_at timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_current public.account_status;
  v_cluster record;
  v_leaver_name text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_user_id = v_actor then raise exception 'cannot_restrict_self'; end if;
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;

  select status into v_current
  from public.account_restrictions where user_id = p_user_id;
  v_current := coalesce(v_current, 'active');

  -- ---- lift to active ------------------------------------------------------
  if p_status = 'active' then
    if v_current = 'banned' then
      perform public.assert_can_manage_roles();
    else
      perform public.assert_can_moderate();
      -- Mirror the apply branch: only admins may touch a staff member's
      -- restriction, so a moderator cannot undo an admin's suspension.
      if not public.can_manage_roles(v_actor) and exists (
        select 1 from public.user_roles
        where user_id = p_user_id and revoked_at is null
      ) then
        raise exception 'cannot_restrict_staff';
      end if;
    end if;

    update public.account_restrictions
    set status = 'active', expires_at = null,
        lifted_by = v_actor, lifted_at = now()
    where user_id = p_user_id;

    insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
    values (v_actor, p_user_id,
            case when v_current = 'banned'
              then 'ban_lifted'::public.moderation_action_type
              else 'suspension_lifted'::public.moderation_action_type
            end,
            p_reason, jsonb_build_object('previous_status', v_current::text));
    return;
  end if;

  -- ---- suspension ----------------------------------------------------------
  if p_status = 'suspended' then
    perform public.assert_can_moderate();

    -- A permanent ban is only reversible by an admin (see the lift branch
    -- above). Downgrading it to a short suspension would otherwise let a
    -- moderator undo it once the expiry lapses and 0062 auto-lifts the row.
    if v_current = 'banned' and not public.can_manage_roles(v_actor) then
      raise exception 'cannot_unban';
    end if;

    -- Every suspension is temporary: a NULL expiry would be a permanent,
    -- non-lapsing restriction that bypasses the ban semantics (no role
    -- revocation, no cluster departure). Permanent removal is `banned`.
    if p_expires_at is null then raise exception 'expiry_required'; end if;

    if not public.can_manage_roles(v_actor) and exists (
      select 1 from public.user_roles
      where user_id = p_user_id and revoked_at is null
    ) then
      raise exception 'cannot_restrict_staff';
    end if;

    if not public.can_manage_roles(v_actor) then
      if p_expires_at > now() + interval '7 days' then raise exception 'suspension_too_long'; end if;
    end if;

    insert into public.account_restrictions (user_id, status, expires_at, reason, changed_by, changed_at)
    values (p_user_id, 'suspended', p_expires_at, p_reason, v_actor, now())
    on conflict (user_id)
    do update set status = excluded.status, expires_at = excluded.expires_at,
                  reason = excluded.reason, changed_by = excluded.changed_by,
                  changed_at = excluded.changed_at, lifted_by = null, lifted_at = null;

    insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
    values (v_actor, p_user_id, 'suspension_applied', p_reason,
            jsonb_build_object('expires_at', p_expires_at));

    insert into public.notifications (user_id, type, cluster_id, title, body)
    values (p_user_id, 'moderation_notice', null,
            'Your account has been temporarily suspended',
            'You will regain access when the restriction ends. If you think this is a mistake, please contact support.');
    return;
  end if;

  -- ---- permanent ban -------------------------------------------------------
  perform public.assert_can_manage_roles();

  if exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin' and revoked_at is null
  ) and not exists (
    select 1 from public.user_roles
    where role = 'admin' and revoked_at is null and user_id <> p_user_id
  ) then
    raise exception 'last_admin_required';
  end if;

  update public.user_roles
  set revoked_at = now(), revoked_by = v_actor
  where user_id = p_user_id and revoked_at is null;

  select display_name into v_leaver_name from public.profiles where id = p_user_id;

  for v_cluster in
    select distinct cm.cluster_id
    from public.cluster_members cm
    where cm.user_id = p_user_id and cm.left_at is null
  loop
    update public.cluster_members set left_at = now()
    where cluster_id = v_cluster.cluster_id and user_id = p_user_id;

    insert into public.notifications (user_id, type, cluster_id, title, body)
    select cm.user_id, 'replacement', v_cluster.cluster_id,
           coalesce(v_leaver_name, 'A member') || ' left the cluster',
           'A spot just opened - we are finding a new member to fill it.'
    from public.cluster_members cm
    where cm.cluster_id = v_cluster.cluster_id and cm.left_at is null;

    perform public.start_replacement(v_cluster.cluster_id);
  end loop;

  insert into public.account_restrictions (user_id, status, reason, changed_by, changed_at)
  values (p_user_id, 'banned', p_reason, v_actor, now())
  on conflict (user_id)
  do update set status = excluded.status, expires_at = null,
                reason = excluded.reason, changed_by = excluded.changed_by,
                changed_at = excluded.changed_at, lifted_by = null, lifted_at = null;

  insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
  values (v_actor, p_user_id, 'ban_applied', p_reason, '{}'::jsonb);
end; $$;

-- -- 2) Drop dead MFA assertion ------------------------------------------------

revoke execute on function public.assert_staff_aal2() from authenticated;
drop function if exists public.assert_staff_aal2();
-- 0063_staff_status_and_ban_lift_guards.sql
-- Two RPC-level authorisation gaps found in the RBAC review:
--   1) Staff assertions only checked role membership, never account status,
--      so a suspended or banned moderator/admin could still use every staff
--      RPC directly (contradicting "suspensions and bans are enforced against
--      direct Supabase calls, not only through navigation"). Both assertions,
--      which every staff RPC funnels through, now also require an active
--      account. The member write path already did via `assert_account_can_write`.
--   2) A moderator could turn a permanent ban into a short temporary
--      suspension (a de facto unban): the suspension branch never inspected
--      the target's current status, and a ban revokes all roles so the
--      `cannot_restrict_staff` guard had nothing to fall back on. Downgrading
--      a ban now requires the same admin privilege as lifting it.
--
-- Read RPCs (`get_moderation_queue`, `get_moderation_report`, and the rest)
-- need no edits: they already raise through `assert_can_moderate`, so they
-- inherit the status check.

-- -- 1) Staff assertions require an active account --------------------------

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
end; $$;

-- -- 2) Ban -> suspension downgrade guard -------------------------------------

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

    if not public.can_manage_roles(v_actor) and exists (
      select 1 from public.user_roles
      where user_id = p_user_id and revoked_at is null
    ) then
      raise exception 'cannot_restrict_staff';
    end if;

    if not public.can_manage_roles(v_actor) then
      if p_expires_at is null then raise exception 'expiry_required'; end if;
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
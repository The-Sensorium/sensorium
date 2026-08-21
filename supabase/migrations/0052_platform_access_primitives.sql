-- 0052_platform_access_primitives.sql
-- Phase 1 of the role-based access plan (docs/ROLE_BASED_ACCESS_PLAN.md):
-- platform-level RBAC primitives with no UI and no write path yet.
--
-- Adds the role/account-status/audit enums, the assignment/restriction/audit
-- tables, and the read-side access helpers that later migrations build on.
-- Every account is implicitly a `member`; `moderator` and `admin` assignments
-- live in user_roles. No production admin is seeded here.
--
-- Security model: the three new tables carry RLS with no policies — direct
-- client reads and writes are denied. All access flows through security
-- definer helpers / RPCs owned by postgres. The anon role gets nothing.

-- -- 1) Enums ----------------------------------------------------------------

create type public.platform_role as enum ('moderator', 'admin');

create type public.account_status as enum ('active', 'suspended', 'banned');

create type public.moderation_action_type as enum (
  'report_claimed',
  'report_released',
  'report_dismissed',
  'report_actioned',
  'warning_issued',
  'message_hidden',
  'message_restored',
  'suspension_applied',
  'suspension_lifted',
  'ban_applied',
  'ban_lifted',
  'role_granted',
  'role_revoked'
);

-- -- 2) Role assignments -----------------------------------------------------

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  role public.platform_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  grant_reason text not null check (char_length(grant_reason) between 1 and 500)
);

create unique index user_roles_one_active_assignment
  on public.user_roles (user_id, role)
  where revoked_at is null;

create index user_roles_active_role_idx
  on public.user_roles (role)
  where revoked_at is null;

alter table public.user_roles enable row level security;

-- -- 3) Account restrictions -------------------------------------------------

create table public.account_restrictions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status public.account_status not null default 'active',
  expires_at timestamptz,
  reason text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  lifted_by uuid references public.profiles(id) on delete set null,
  lifted_at timestamptz,
  constraint active_has_no_expiry check (status <> 'active' or expires_at is null),
  constraint banned_has_no_expiry check (status <> 'banned' or expires_at is null)
);

create index account_restrictions_status_expiry_idx
  on public.account_restrictions (status, expires_at);

alter table public.account_restrictions enable row level security;

-- -- 4) Moderation audit log -------------------------------------------------

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  action public.moderation_action_type not null,
  reason text not null check (char_length(reason) between 1 and 2000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index moderation_actions_created_idx on public.moderation_actions (created_at desc);
create index moderation_actions_actor_idx on public.moderation_actions (actor_id, created_at desc);
create index moderation_actions_target_idx on public.moderation_actions (target_user_id, created_at desc);
create index moderation_actions_report_idx on public.moderation_actions (report_id, created_at desc);

alter table public.moderation_actions enable row level security;

-- -- 5) Access helper functions ----------------------------------------------

create function public.has_platform_role(p_user_id uuid, p_role public.platform_role)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_user_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.user_roles r
    where r.user_id = p_user_id and r.role = p_role and r.revoked_at is null
  );
end; $$;

create function public.can_moderate(p_user_id uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.has_platform_role(p_user_id, 'moderator')
      or public.has_platform_role(p_user_id, 'admin');
end; $$;

create function public.can_manage_roles(p_user_id uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.has_platform_role(p_user_id, 'admin');
end; $$;

create function public.is_account_active(p_user_id uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_status public.account_status;
  v_expires_at timestamptz;
begin
  if p_user_id is null then
    return false;
  end if;

  select r.status, r.expires_at into v_status, v_expires_at
  from public.account_restrictions r
  where r.user_id = p_user_id;

  if v_status is null or v_status = 'active' then
    return true;
  end if;

  if v_status = 'suspended' and v_expires_at is not null and v_expires_at <= now() then
    return true;
  end if;

  return false;
end; $$;

create function public.jwt_has_aal2()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create function public.assert_can_moderate()
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

create function public.assert_can_manage_roles()
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

create function public.assert_account_can_write()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_account_active(auth.uid()) then
    raise exception 'account_inactive';
  end if;
end; $$;

-- -- 6) Signed-in access query ----------------------------------------------

create function public.get_my_access()
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

  select p.onboarding_completed_at is not null into v_onboarding_completed
  from public.profiles p
  where p.id = v_user_id;

  return query select
    v_user_id,
    v_roles,
    array['member'::text] || v_roles,
    v_capabilities,
    coalesce(v_restriction.status, 'active'::public.account_status),
    v_restriction.expires_at,
    coalesce(v_onboarding_completed, false),
    public.jwt_has_aal2();
end; $$;

-- -- 7) Grants ---------------------------------------------------------------

revoke all on table public.user_roles, public.account_restrictions, public.moderation_actions from anon;
revoke all on table public.user_roles, public.account_restrictions, public.moderation_actions from authenticated;

grant select, insert, update on public.user_roles to service_role;
grant select, insert, update on public.account_restrictions to service_role;
grant select, insert on public.moderation_actions to service_role;

grant execute on function
  public.has_platform_role(uuid, public.platform_role),
  public.can_moderate(uuid),
  public.can_manage_roles(uuid),
  public.is_account_active(uuid),
  public.jwt_has_aal2(),
  public.assert_can_moderate(),
  public.assert_can_manage_roles(),
  public.assert_account_can_write(),
  public.get_my_access()
  to authenticated;
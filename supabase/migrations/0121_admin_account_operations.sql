-- 0121_admin_account_operations.sql
-- Phase 4 of ADMIN_MODERATION_PRODUCTION_PLAN: account operations. Staff need
-- a target profile view; admins need full account detail. Privacy boundary is
-- enforced in SQL, not the UI: email is only ever returned to admins, and all
-- reads go through security-definer RPCs gated by can_moderate.

-- -- 1) Staff-safe account search (moderators included, email admin-only) ---------

create or replace function public.search_accounts_v2(p_query text, p_limit integer default 8)
returns table (
  user_id uuid,
  display_name text,
  email text,
  account_status public.account_status,
  roles text[]
)
language plpgsql security definer set search_path = public as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 8), 20));
  v_admin boolean := public.can_manage_roles(auth.uid());
begin
  perform public.assert_can_moderate();
  if char_length(v_query) < 2 then
    return;
  end if;

  return query
  select
    p.id,
    p.display_name,
    case when v_admin then p.email else null end,
    coalesce(ar.status, 'active'::public.account_status),
    coalesce((select array_agg(ur.role::text) from public.user_roles ur
      where ur.user_id = p.id and ur.revoked_at is null), '{}'::text[])
  from public.profiles p
  left join public.account_restrictions ar on ar.user_id = p.id
  where p.display_name ilike '%' || public.escape_like_pattern(v_query) || '%' escape '\'
     or (v_admin and p.email ilike '%' || public.escape_like_pattern(v_query) || '%' escape '\')
  order by
    case when lower(p.display_name) = v_query then 0 else 1 end,
    p.display_name asc
  limit v_limit;
end; $$;

-- -- 2) Account detail (email redacted for moderators) -------------------------------

create or replace function public.get_staff_account_detail(p_user_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  account_created_at timestamptz,
  account_status public.account_status,
  restriction_expires_at timestamptz,
  restriction_reason text,
  roles text[],
  cluster_names text[],
  open_reports_against integer,
  total_reports_against integer,
  reports_filed integer,
  enforcement_count integer,
  appeals_count integer
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := public.can_manage_roles(auth.uid());
begin
  perform public.assert_can_moderate();
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  return query
  select
    p.id,
    p.display_name,
    case when v_admin then p.email else null end,
    p.created_at,
    coalesce(ar.status, 'active'::public.account_status),
    ar.expires_at,
    ar.reason,
    coalesce((select array_agg(ur.role::text) from public.user_roles ur
      where ur.user_id = p.id and ur.revoked_at is null), '{}'::text[]),
    coalesce((select array_agg(cc.name) from (
      select cc.name from public.cluster_members cm
      join public.clusters cc on cc.id = cm.cluster_id
      where cm.user_id = p.id and cm.left_at is null
      limit 20
    ) cc), '{}'::text[]),
    (select count(*)::int from public.reports r
      where r.target_user_id = p.id and r.status in ('pending', 'reviewing')),
    (select count(*)::int from public.reports r where r.target_user_id = p.id),
    (select count(*)::int from public.reports r where r.reporter_id = p.id),
    (select count(*)::int from public.moderation_actions ma where ma.target_user_id = p.id),
    (select count(*)::int from public.appeals a where a.user_id = p.id)
  from public.profiles p
  left join public.account_restrictions ar on ar.user_id = p.id
  where p.id = p_user_id;
end; $$;

-- -- 3) Account moderation history (reports + actions + appeals, newest first) ---------

create or replace function public.get_account_moderation_history(
  p_user_id uuid,
  p_limit integer default 25,
  p_cursor jsonb default null
)
returns table (
  entry_id uuid,
  kind text,
  created_at timestamptz,
  summary text,
  status text,
  report_id uuid,
  appeal_id uuid
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_cursor_at timestamptz := nullif(p_cursor ->> 'created_at', '')::timestamptz;
  v_cursor_id uuid := nullif(p_cursor ->> 'id', '')::uuid;
begin
  perform public.assert_can_moderate();
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  return query
  select h.entry_id as entry_id, h.kind as kind, h.created_at as created_at,
    h.summary as summary, h.status as status, h.report_id as report_id, h.appeal_id as appeal_id
  from (
    select
      r.id as entry_id, 'report'::text as kind, r.created_at as created_at,
      (case when r.reporter_id = p_user_id then 'filed' else 'against' end
        || ' · ' || r.reason::text || ' · ' || r.status::text) as summary,
      r.status::text as status, r.id as report_id, null::uuid as appeal_id
    from public.reports r
    where r.reporter_id = p_user_id or r.target_user_id = p_user_id
    union all
    select
      ma.id as entry_id, 'action'::text as kind, ma.created_at as created_at,
      (ma.action::text || ' · ' || left(ma.reason, 120)) as summary,
      null::text as status, ma.report_id as report_id, null::uuid as appeal_id
    from public.moderation_actions ma
    where ma.target_user_id = p_user_id or ma.actor_id = p_user_id
    union all
    select
      a.id as entry_id, 'appeal'::text as kind, a.created_at as created_at,
      ('appeal · ' || a.status::text) as summary,
      a.status::text as status, null::uuid as report_id, a.id as appeal_id
    from public.appeals a
    where a.user_id = p_user_id
  ) h
  where v_cursor_at is null or (h.created_at, h.entry_id) < (v_cursor_at, coalesce(v_cursor_id, h.entry_id))
  order by h.created_at desc, h.entry_id desc
  limit v_limit;
end; $$;

-- -- 4) Explicit lift restriction (clearer than apply(active)) ----------------------------

create or replace function public.lift_account_restriction(p_user_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then
    raise exception 'user_not_found';
  end if;
  perform public.apply_account_restriction(p_user_id, 'active', p_reason);
end; $$;

-- -- 5) Grants -------------------------------------------------------------------------------

grant execute on function
  public.search_accounts_v2(text, integer),
  public.get_staff_account_detail(uuid),
  public.get_account_moderation_history(uuid, integer, jsonb),
  public.lift_account_restriction(uuid, text)
  to authenticated;

grant execute on function
  public.search_accounts_v2(text, integer),
  public.get_staff_account_detail(uuid),
  public.get_account_moderation_history(uuid, integer, jsonb),
  public.lift_account_restriction(uuid, text)
  to service_role;

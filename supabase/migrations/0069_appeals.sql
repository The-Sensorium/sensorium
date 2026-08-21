-- 0069_appeals.sql
-- The in-app appeal flow for restricted accounts (suspended / banned) and the
-- admin review lane. Appeals are only ever created while an account is
-- restricted; the page is reached from the email CTA or the restricted screen.
--
-- Security model mirrors the moderation tables: `appeals` carries RLS with no
-- policies (no direct client access), and every operation goes through security
-- definer RPCs. Members see only their own appeals via get_my_appeal; staff
-- queue reads and decisions are admin-only (can_manage_roles).

-- -- 1) Enum + table ----------------------------------------------------------

create type public.appeal_status as enum ('submitted', 'resolved');

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  appealed_status public.account_status not null,
  appealed_reason text not null,
  appealed_expires_at timestamptz,
  details text not null check (char_length(details) between 1 and 5000),
  status public.appeal_status not null default 'submitted',
  response text check (response is null or char_length(response) between 1 and 2000),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one open appeal per account. A resolved appeal stays readable as the
-- historic record; re-appealing opens a new row.
create unique index appeals_one_open_per_user
  on public.appeals (user_id)
  where status = 'submitted';

create index appeals_queue_idx
  on public.appeals (status, created_at desc);

alter table public.appeals enable row level security;

-- -- 2) Member side -----------------------------------------------------------

create function public.submit_appeal(p_details text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_restriction public.account_restrictions%rowtype;
  v_appeal_id uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_details is null or char_length(btrim(p_details)) = 0 then
    raise exception 'details_required';
  end if;
  if char_length(p_details) > 5000 then raise exception 'details_too_long'; end if;

  select r.* into v_restriction
  from public.account_restrictions r
  where r.user_id = v_user_id;

  -- Only restricted accounts appeal. A lapsed suspension counts as active
  -- (is_account_active), so an account whose window ended cannot appeal.
  if public.is_account_active(v_user_id) then
    raise exception 'account_not_restricted';
  end if;
  if v_restriction.status not in ('suspended', 'banned') then
    raise exception 'account_not_restricted';
  end if;

  insert into public.appeals (user_id, appealed_status, appealed_reason, appealed_expires_at, details)
  values (
    v_user_id,
    v_restriction.status,
    v_restriction.reason,
    v_restriction.expires_at,
    btrim(p_details)
  )
  returning id into v_appeal_id;

  perform public.enqueue_email(
    v_user_id,
    'appeal-received',
    jsonb_build_object(
      'display_name', (select display_name from public.profiles where id = v_user_id),
      'appeal_url', public.app_url() || '/appeal'
    )
  );

  return v_appeal_id;
end; $$;

create function public.get_my_appeal()
returns table (
  id uuid,
  appealed_status public.account_status,
  appealed_reason text,
  appealed_expires_at timestamptz,
  details text,
  status public.appeal_status,
  response text,
  created_at timestamptz,
  decided_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    a.id,
    a.appealed_status,
    a.appealed_reason,
    a.appealed_expires_at,
    a.details,
    a.status,
    a.response,
    a.created_at,
    a.decided_at
  from public.appeals a
  where a.user_id = auth.uid()
  order by a.created_at desc;
$$;

-- -- 3) Admin side ------------------------------------------------------------

create function public.list_appeals_page(
  p_status public.appeal_status default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  appealed_status public.account_status,
  appealed_reason text,
  details text,
  status public.appeal_status,
  response text,
  created_at timestamptz,
  decided_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    a.id,
    a.user_id,
    p.display_name,
    a.appealed_status,
    a.appealed_reason,
    a.details,
    a.status,
    a.response,
    a.created_at,
    a.decided_at
  from public.appeals a
  left join public.profiles p on p.id = a.user_id
  where public.can_manage_roles(auth.uid())
    and (p_status is null or a.status = p_status)
  order by a.created_at desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

create function public.get_admin_appeal(p_appeal_id uuid)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  appealed_status public.account_status,
  appealed_reason text,
  appealed_expires_at timestamptz,
  details text,
  status public.appeal_status,
  response text,
  created_at timestamptz,
  decided_at timestamptz,
  current_account_status public.account_status,
  current_restriction_reason text,
  current_restriction_expires_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    a.id,
    a.user_id,
    p.display_name,
    a.appealed_status,
    a.appealed_reason,
    a.appealed_expires_at,
    a.details,
    a.status,
    a.response,
    a.created_at,
    a.decided_at,
    r.status,
    r.reason,
    r.expires_at
  from public.appeals a
  left join public.profiles p on p.id = a.user_id
  left join public.account_restrictions r on r.user_id = a.user_id
  where a.id = p_appeal_id
    and public.can_manage_roles(auth.uid());
$$;

create function public.decide_appeal(
  p_appeal_id uuid,
  p_accept boolean,
  p_response text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_appeal public.appeals%rowtype;
begin
  perform public.assert_can_manage_roles();
  if p_response is null or char_length(btrim(p_response)) = 0 then
    raise exception 'response_required';
  end if;
  if char_length(p_response) > 2000 then raise exception 'response_too_long'; end if;

  select a.* into v_appeal
  from public.appeals a
  where a.id = p_appeal_id
  for update;
  if v_appeal.id is null then raise exception 'appeal_not_found'; end if;
  if v_appeal.status <> 'submitted' then raise exception 'appeal_already_resolved'; end if;

  if p_accept and v_appeal.user_id is not null then
    begin
      -- Lifts the restriction through apply_account_restriction so its guards
      -- (admin-only ban lift, staff protection, last-admin) all apply. The
      -- actor here is the deciding admin, so auth.uid() is meaningful.
      perform public.apply_account_restriction(v_appeal.user_id, 'active', p_response);
    exception when others then
      if sqlerrm like '%restriction_not_active%' then
        -- The account is already active (e.g. a suspension elapsed while the
        -- appeal was open). Resolve as granted-with-note rather than erroring.
        null;
      else
        raise;
      end if;
    end;
  end if;

  update public.appeals
  set status = 'resolved',
      response = btrim(p_response),
      decided_by = v_actor,
      decided_at = now(),
      updated_at = now()
  where id = p_appeal_id;

  insert into public.moderation_actions (actor_id, target_user_id, reason, action, metadata)
  values (v_actor, v_appeal.user_id,
          'Appeal ' || case when p_accept then 'accepted' else 'rejected' end,
          'appeal_decided',
          jsonb_build_object('accepted', p_accept, 'appealed_status', v_appeal.appealed_status::text));

  if v_appeal.user_id is not null then
    perform public.enqueue_email(
      v_appeal.user_id,
      'appeal-resolved',
      jsonb_build_object(
        'display_name', (select display_name from public.profiles where id = v_appeal.user_id),
        'accepted', p_accept,
        'response', btrim(p_response),
        'appeal_url', public.app_url() || '/appeal'
      )
    );
  end if;
end; $$;

-- -- 4) Grants ----------------------------------------------------------------
-- Staff queue reads/decisions are admin-only inside the function bodies; the
-- authenticated grant just unlocks them for the admin shell. Appeals records
-- themselves are never readable by clients.

revoke all on table public.appeals from anon, authenticated;
grant select, insert, update on public.appeals to service_role;

grant execute on function
  public.submit_appeal(text),
  public.get_my_appeal(),
  public.list_appeals_page(public.appeal_status, integer, integer),
  public.get_admin_appeal(uuid),
  public.decide_appeal(uuid, boolean, text)
  to authenticated;
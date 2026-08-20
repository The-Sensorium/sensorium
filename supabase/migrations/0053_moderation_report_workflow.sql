-- 0053_moderation_report_workflow.sql
-- Phase 2 of the role-based access plan: the moderator report workflow behind
-- no UI. Adds the report workflow columns, database-level duplicate protection,
-- a validated report_member (accepts an optional message reference), and the
-- queue/context/claim/release/resolve RPCs plus get_my_reports().
--
-- Direct client access to `reports` is removed: the RLS read-own/insert-self
-- policies are dropped and the 0017 grants are revoked. Reporters and staff go
-- through narrow security definer functions only. The former FKs to profiles
-- become nullable `on delete set null` so account deletion (Migration C) can
-- anonymize retained rows under the 24-month retention policy.

-- -- 1) Report workflow columns + indexes ------------------------------------

-- The original reporter_id/target_user_id FKs (0009) are unnamed and use the
-- default NO ACTION, which would block account deletion. Drop every FK on
-- `reports` that points at `profiles` first, then rebuild them as nullable
-- `on delete set null`. The new assigned_to/reviewed_by columns are added
-- afterwards so this block only ever sees the two original constraints.
do $$
declare
  cons text;
begin
  for cons in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.reports'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.profiles'::regclass
  loop
    execute format('alter table public.reports drop constraint %I', cons);
  end loop;
end $$;

alter table public.reports
  alter column reporter_id drop not null,
  add constraint reports_reporter_fk
    foreign key (reporter_id) references public.profiles(id) on delete set null,
  alter column target_user_id drop not null,
  add constraint reports_target_fk
    foreign key (target_user_id) references public.profiles(id) on delete set null,
  add column assigned_to uuid references public.profiles(id) on delete set null,
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column resolution_note text check (resolution_note is null or char_length(resolution_note) <= 5000),
  add column updated_at timestamptz not null default now(),
  add column message_id uuid references public.messages(id) on delete set null,
  add column evidence jsonb;

create index reports_moderation_queue_idx
  on public.reports (status, created_at desc);

create index reports_message_id_idx
  on public.reports (message_id)
  where message_id is not null;

create index reports_assigned_to_idx
  on public.reports (assigned_to)
  where assigned_to is not null;

-- Database-level duplicate guard. The old report_member relied on a
-- check-then-insert, which races under concurrency; the unique index rejects
-- the second insert outright and lets the function raise a friendly error.
-- NULL reporter/target ids (anonymized rows) are never conflicting.
create unique index reports_one_open_per_reporter_target
  on public.reports (reporter_id, target_user_id)
  where status in ('pending', 'reviewing');

-- -- 2) Remove direct client access to reports -------------------------------

drop policy "reports insert self" on public.reports;
drop policy "reports read own" on public.reports;

revoke select, insert on public.reports from authenticated;

-- -- 3) Report a member (validated, optional message reference) ---------------

create or replace function public.report_member(
  p_cluster_id uuid,
  p_target_user_id uuid,
  p_reason public.report_reason,
  p_details text default null,
  p_message_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reporter_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_reporter_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_reporter_id = p_target_user_id then
    raise exception 'cannot_report_self';
  end if;

  if p_details is not null and char_length(p_details) > 2000 then
    raise exception 'details_too_long';
  end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = v_reporter_id
  ) then
    raise exception 'not_a_member';
  end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = p_target_user_id
  ) then
    raise exception 'not_a_member';
  end if;

  -- Optional message reference: the message must belong to the reported cluster
  -- and must be authored by the reported target. Prevents using a message id to
  -- report someone else's content under a different target.
  if p_message_id is not null and not exists (
    select 1 from public.messages
    where id = p_message_id
      and cluster_id = p_cluster_id
      and author_id = p_target_user_id
      and deleted_at is null
  ) then
    raise exception 'message_not_reportable';
  end if;

  if exists (
    select 1 from public.reports
    where reporter_id = v_reporter_id
      and target_user_id = p_target_user_id
      and status in ('pending', 'reviewing')
  ) then
    raise exception 'duplicate_report';
  end if;

  insert into public.reports (
    cluster_id, reporter_id, target_user_id, reason, details, message_id
  )
  values (p_cluster_id, v_reporter_id, p_target_user_id, p_reason, p_details, p_message_id)
  returning id into v_report_id;

  return v_report_id;
end;
$$;

-- -- 4) Moderator queue and case RPCs ----------------------------------------

create function public.get_moderation_queue(
  p_status public.report_status default null,
  p_assigned_to uuid default null,
  p_limit integer default 50,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  cluster_id uuid,
  cluster_name text,
  target_user_id uuid,
  target_display_name text,
  reason public.report_reason,
  details text,
  message_id uuid,
  status public.report_status,
  assigned_to uuid,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    r.id,
    r.cluster_id,
    c.name,
    r.target_user_id,
    t.display_name,
    r.reason,
    r.details,
    r.message_id,
    r.status,
    r.assigned_to,
    r.created_at
  from public.reports r
  join public.clusters c on c.id = r.cluster_id
  left join public.profiles t on t.id = r.target_user_id
  where public.can_moderate(auth.uid())
    and (p_status is null or r.status = p_status)
    and (p_assigned_to is null or r.assigned_to = p_assigned_to)
    and (
      p_cursor_created_at is null
      or (r.created_at, r.id) > (p_cursor_created_at, coalesce(p_cursor_id, r.id))
    )
  order by r.created_at asc, r.id asc
  limit greatest(1, least(p_limit, 100));
$$;

create function public.get_moderation_report(p_report_id uuid)
returns table (
  id uuid,
  cluster_id uuid,
  cluster_name text,
  reporter_id uuid,
  reporter_display_name text,
  target_user_id uuid,
  target_display_name text,
  reason public.report_reason,
  details text,
  message_id uuid,
  status public.report_status,
  assigned_to uuid,
  reviewed_by uuid,
  resolution_note text,
  evidence jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  prior_reports integer
)
language sql stable security definer set search_path = public as $$
  select
    r.id,
    r.cluster_id,
    coalesce(c.name, 'Removed cluster'),
    r.reporter_id,
    rp.display_name,
    r.target_user_id,
    t.display_name,
    r.reason,
    r.details,
    r.message_id,
    r.status,
    r.assigned_to,
    r.reviewed_by,
    r.resolution_note,
    r.evidence,
    r.created_at,
    r.updated_at,
    (select count(*)::int
     from public.reports pr
     where pr.target_user_id = r.target_user_id and pr.id <> r.id)
  from public.reports r
  left join public.clusters c on c.id = r.cluster_id
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles t on t.id = r.target_user_id
  where r.id = p_report_id
    and public.can_moderate(auth.uid());
$$;

-- Case-scoped read of the reported message content. The moderator is not
-- required to be a member of the reported cluster; access only ever carries the
-- message referenced by a report they are allowed to review.
create function public.get_moderation_message(p_report_id uuid)
returns table (
  message_id uuid,
  author_id uuid,
  content text,
  image_url text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.author_id, m.content, m.image_url, m.created_at
  from public.reports r
  join public.messages m on m.id = r.message_id
  where r.id = p_report_id
    and public.can_moderate(auth.uid());
$$;

create function public.claim_moderation_report(p_report_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_moderate(v_actor) then
    raise exception 'insufficient_permission';
  end if;

  update public.reports
  set status = 'reviewing', assigned_to = v_actor, updated_at = now()
  where id = p_report_id
    and status = 'pending'
    and assigned_to is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'cannot_claim_not_open_and_unassigned';
  end if;

  insert into public.moderation_actions (actor_id, report_id, action, reason, metadata)
  values (v_actor, p_report_id, 'report_claimed', 'Report claimed', '{}'::jsonb);
end; $$;

create function public.release_moderation_report(p_report_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_moderate(v_actor) then
    raise exception 'insufficient_permission';
  end if;

  update public.reports
  set status = 'pending', assigned_to = null, updated_at = now()
  where id = p_report_id
    and assigned_to = v_actor
    and status in ('pending', 'reviewing');

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'cannot_release_not_assigned_to_you';
  end if;

  insert into public.moderation_actions (actor_id, report_id, action, reason, metadata)
  values (v_actor, p_report_id, 'report_released', 'Report released', '{}'::jsonb);
end; $$;

create function public.resolve_moderation_report(
  p_report_id uuid,
  p_status public.report_status,
  p_note text default null,
  p_action jsonb default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_current public.report_status;
  v_action_recorded jsonb := coalesce(p_action, '{}'::jsonb);
begin
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_moderate(v_actor) then
    raise exception 'insufficient_permission';
  end if;

  select status into v_current
  from public.reports where id = p_report_id;
  if v_current is null then
    raise exception 'report_not_found';
  end if;

  -- Transition table (plan section 8.2). A resolved report is terminal in the
  -- first release; reopen by filing a new report.
  if p_status not in ('actioned', 'dismissed') then
    raise exception 'invalid_status_transition';
  end if;
  if v_current not in ('pending', 'reviewing') then
    raise exception 'invalid_status_transition';
  end if;

  if p_status = 'actioned' and (p_note is null or char_length(p_note) = 0) then
    raise exception 'resolution_note_required';
  end if;
  if p_note is not null and char_length(p_note) > 5000 then
    raise exception 'note_too_long';
  end if;

  -- p_action records what the moderator claims to have done (e.g.
  -- {"type":"message_hidden","message_id":...}). It is metadata for the audit
  -- trail only and is never interpreted as SQL or arbitrary column updates;
  -- the actual content/account enforcement lives in Migration C/D RPCs.
  if jsonb_typeof(v_action_recorded) <> 'object' then
    raise exception 'invalid_action_payload';
  end if;

  update public.reports
  set status = p_status,
      resolution_note = coalesce(p_note, resolution_note),
      reviewed_by = v_actor,
      reviewed_at = now(),
      assigned_to = coalesce(assigned_to, v_actor),
      updated_at = now()
  where id = p_report_id;

  insert into public.moderation_actions (
    actor_id, report_id, action, reason, metadata
  )
  values (
    v_actor,
    p_report_id,
    case
      when p_status = 'actioned'
        then 'report_actioned'::public.moderation_action_type
      else 'report_dismissed'::public.moderation_action_type
    end,
    coalesce(p_note, 'Report resolved'),
    v_action_recorded
  );
end; $$;

-- -- 5) Reporter status query ------------------------------------------------

create function public.get_my_reports()
returns table (
  id uuid,
  cluster_id uuid,
  target_user_id uuid,
  reason public.report_reason,
  details text,
  status public.report_status,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.cluster_id, r.target_user_id, r.reason, r.details, r.status, r.created_at
  from public.reports r
  where r.reporter_id = auth.uid()
  order by r.created_at desc;
$$;

-- -- 6) Grants ---------------------------------------------------------------

grant execute on function
  public.report_member(uuid, uuid, public.report_reason, text, uuid),
  public.get_moderation_queue(public.report_status, uuid, integer, timestamptz, uuid),
  public.get_moderation_report(uuid),
  public.get_moderation_message(uuid),
  public.claim_moderation_report(uuid),
  public.release_moderation_report(uuid),
  public.resolve_moderation_report(uuid, public.report_status, text, jsonb),
  public.get_my_reports()
  to authenticated;

grant execute on function
  public.get_moderation_queue(public.report_status, uuid, integer, timestamptz, uuid),
  public.get_moderation_report(uuid),
  public.get_moderation_message(uuid),
  public.claim_moderation_report(uuid),
  public.release_moderation_report(uuid),
  public.resolve_moderation_report(uuid, public.report_status, text, jsonb),
  public.get_my_reports()
  to service_role;
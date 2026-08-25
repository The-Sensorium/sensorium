-- 0087_staff_notifications.sql
-- Gives the moderation team unread indicators on their tabs by emitting a
-- per-user `notifications` row to each eligible staff member when a report or
-- appeal is created, plus the read-path plumbing. Follows 0086 (the
-- `report_new` / `appeal_new` enum values) and must NOT be squashed with it.
--
-- Security model:
--   * Emission fan-outs inside triggers that run as the definer, so RLS is
--     bypassed only for the internal INSERT into `notifications`. Every row is
--     still addressed to a real staff user, so the table's existing "self"
--     select/update policies still govern who may read / clear it.
--   * Reads are security-definer RPCs that already gate on the caller's role
--     (can_moderate / can_manage_roles), returning 0 for non-staff.
--   * Staff events are dropped from the shared member read path so staff who
--     also browse as members see no moderation noise in their member center.

-- -- 1) Fan-out helper -------------------------------------------------------
-- Inserts one `notifications` row per active staff user holding the role the
-- event targets. `p_admin_only` narrows to admins only (appeals); otherwise all
-- moderators + admins (reports). `p_exclude_user_id` prevents self-notification
-- so staff never badge themselves for their own submission.

create or replace function public.notify_staff(
  p_type public.notification_type,
  p_cluster_id uuid,
  p_title text,
  p_body text,
  p_payload jsonb default null,
  p_admin_only boolean default false,
  p_exclude_user_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select distinct r.user_id, p_type, p_cluster_id, p_title, p_body, p_payload
  from public.user_roles r
  where r.revoked_at is null
    and r.user_id is not null
    and r.role = any (
      case when p_admin_only
           then array['admin']::public.platform_role[]
           else array['admin','moderator']::public.platform_role[]
      end
    )
    and public.is_account_active(r.user_id)
    and r.user_id is distinct from p_exclude_user_id;
end; $$;

-- -- 2) AFTER INSERT triggers ------------------------------------------------
-- A single insertion point per queue table: catches report_member, report_post,
-- report_post_comment, and submit_appeal without re-defining those functions.
-- Duplicate-report guards raise BEFORE the insert, so a rejected duplicate never
-- fires these triggers.

create or replace function public.trigger_report_staff_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    perform public.notify_staff(
      'report_new',
      new.cluster_id,
      'New report: ' || replace(new.reason::text, '_', ' '),
      (select display_name from public.profiles where id = new.target_user_id),
      jsonb_build_object(
        'report_id', new.id,
        'reason', new.reason::text,
        'target_user_id', new.target_user_id
      ),
      false,
      new.reporter_id
    );
  end if;
  return new;
end; $$;

create trigger reports_staff_notify
  after insert on public.reports
  for each row execute function public.trigger_report_staff_notify();

create or replace function public.trigger_appeal_staff_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_staff(
    'appeal_new',
    null,
    'New appeal',
    coalesce((select display_name from public.profiles where id = new.user_id), 'A member')
      || ' has appealed a decision',
    jsonb_build_object('appeal_id', new.id),
    true,
    new.user_id
  );
  return new;
end; $$;

create trigger appeals_staff_notify
  after insert on public.appeals
  for each row execute function public.trigger_appeal_staff_notify();

-- -- 3) Staff unread count + mark-read ---------------------------------------

create or replace function public.get_staff_unread_counts()
returns table (reports bigint, appeals bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select
    case when public.can_moderate(auth.uid())
         then (select count(*)
               from public.notifications n
               where n.user_id = auth.uid()
                 and n.type = 'report_new'
                 and n.read_at is null)
         else 0::bigint end,
    case when public.can_manage_roles(auth.uid())
         then (select count(*)
               from public.notifications n
               where n.user_id = auth.uid()
                 and n.type = 'appeal_new'
                 and n.read_at is null)
         else 0::bigint end;
end; $$;

create or replace function public.mark_staff_notifications_read(p_type public.notification_type)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_type not in ('report_new', 'appeal_new') then
    raise exception 'invalid_notification_type';
  end if;

  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and type = p_type
    and read_at is null;
end; $$;

-- -- 4) Member read-path exclusion -------------------------------------------
-- Staff events are a different concern from member cluster activity, so the two
-- shared read functions are re-created to drop staff-type rows. Bodies match the
-- current 0054 / 0038 definitions exactly apart from the added predicate.

create or replace function public.get_my_notifications()
returns table (
  id uuid,
  type public.notification_type,
  cluster_id uuid,
  title text,
  body text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with unread_chat as (
    select distinct on (cm.cluster_id)
      m.id as message_id,
      m.cluster_id,
      m.content,
      m.created_at,
      pr.display_name
    from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    join public.messages m on m.cluster_id = cm.cluster_id
    join public.profiles pr on pr.id = m.author_id
    left join public.notification_prefs p
      on p.user_id = cm.user_id and p.cluster_id = cm.cluster_id
    where cm.user_id = auth.uid()
      and cm.left_at is null
      and c.introductions_completed_at is not null
      and (p is null or p.messages)
      and m.deleted_at is null
      and m.moderation_status = 'approved'
      and m.author_id <> auth.uid()
      and m.created_at > cm.last_read_message_at
    order by cm.cluster_id, m.created_at desc, m.id desc
  )
  select n.id, n.type, n.cluster_id, n.title, n.body, n.payload, n.read_at, n.created_at
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
    and n.type not in ('report_new', 'appeal_new')
    and public.notification_allowed(p, n.type, n.cluster_id)

  union all

  select
    unread_chat.message_id,
    'message'::public.notification_type,
    unread_chat.cluster_id,
    unread_chat.display_name || ' sent a message',
    case
      when unread_chat.content is null then '[Photo]'
      when unread_chat.content like 'gif:%' then '[GIF]'
      else left(unread_chat.content, 140)
    end,
    jsonb_build_object('message_id', unread_chat.message_id),
    null::timestamptz,
    unread_chat.created_at
  from unread_chat

  order by created_at desc
  limit 100;
$$;

create or replace function public.get_unread_notification_count()
returns bigint
language sql stable security definer set search_path = public as $$
  select (
    -- discrete unread events (existing behavior, minus staff events)
    (select count(*)
     from public.notifications n
     left join public.notification_prefs p
       on p.user_id = n.user_id and p.cluster_id = n.cluster_id
     where n.user_id = auth.uid()
       and n.read_at is null
       and n.type not in ('report_new', 'appeal_new')
       and public.notification_allowed(p, n.type, n.cluster_id))
    +
    -- unread chat messages across the caller's active, unlocked clusters
    (select count(*)
     from public.messages m
     join public.cluster_members cm on cm.cluster_id = m.cluster_id
     join public.clusters c on c.id = cm.cluster_id
     left join public.notification_prefs p
       on p.user_id = cm.user_id and p.cluster_id = cm.cluster_id
     where cm.user_id = auth.uid()
       and cm.left_at is null
       and c.introductions_completed_at is not null
       and (p is null or p.messages)
       and m.deleted_at is null
       and m.author_id <> auth.uid()
       and m.created_at > cm.last_read_message_at)
  )::bigint;
$$;

-- -- 5) Grants ---------------------------------------------------------------
-- `notify_staff` and the trigger functions run only inside the database and are
-- not client-callable, so they need no grants. The new client-facing RPCs do.
-- The re-created member read functions keep their existing grants from 0054 /
-- 0038 (a `create or replace` preserves them).

grant execute on function
  public.get_staff_unread_counts(),
  public.mark_staff_notifications_read(public.notification_type)
  to authenticated;

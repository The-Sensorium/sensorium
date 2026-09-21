-- 0134_notifications_unread_perf.sql
-- Perf: get_my_notifications built unread chat with row_number() + count(*)
-- window functions over EVERY unread message, then filtered to rn = 1. A user
-- away for weeks paid a multi-thousand-row sort per center open, and the badge
-- (get_unread_notification_count, 0114) paid it again by counting the full
-- 100-row projection with titles/bodies.
--
-- Re-created from the 0133 definition with identical output semantics
-- (same columns, same "N new messages" title, same [Photo]/[GIF] body, same
-- prefs filtering, same LIMIT 100, same seen-vs-clear stored rows):
--   1. unread chat latest row per cluster via DISTINCT ON (index-friendly, stops
--      at the first row per cluster like 0051 did) instead of row_number().
--   2. per-cluster unread counts via a plain GROUP BY (index count, no window
--      sort) to keep the "N new messages" title exact.
--   3. get_unread_notification_count no longer renders the projection: one cheap
--      stored-unread COUNT plus one EXISTS probe per cluster (stops at the first
--      unread message). Badge still equals unread rows shown (0114 invariant)
--      whenever the center is not truncated at LIMIT 100; past 100 total unread
--      the badge now reports the true count instead of the capped window.

create index messages_unread_idx
  on public.messages (cluster_id, created_at desc, id desc)
  where deleted_at is null and moderation_status = 'approved';

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
  with my_clusters as (
    select cm.cluster_id, cm.last_read_message_at
    from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    left join public.notification_prefs p
      on p.user_id = cm.user_id and p.cluster_id = cm.cluster_id
    where cm.user_id = auth.uid()
      and cm.left_at is null
      and c.introductions_completed_at is not null
      and (p is null or p.messages)
  ),
  chat_latest as (
    select distinct on (mc.cluster_id)
      m.id as message_id,
      m.cluster_id,
      m.content,
      m.created_at,
      pr.display_name
    from my_clusters mc
    join public.messages m on m.cluster_id = mc.cluster_id
    join public.profiles pr on pr.id = m.author_id
    where m.deleted_at is null
      and m.moderation_status = 'approved'
      and m.author_id <> auth.uid()
      and m.created_at > mc.last_read_message_at
    order by mc.cluster_id, m.created_at desc, m.id desc
  ),
  chat_counts as (
    select m.cluster_id, count(*) as message_count
    from my_clusters mc
    join public.messages m on m.cluster_id = mc.cluster_id
    where m.deleted_at is null
      and m.moderation_status = 'approved'
      and m.author_id <> auth.uid()
      and m.created_at > mc.last_read_message_at
    group by m.cluster_id
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
    chat_latest.message_id,
    'message'::public.notification_type,
    chat_latest.cluster_id,
    case
      when chat_counts.message_count > 1
        then chat_counts.message_count || ' new messages'
      else chat_latest.display_name || ' sent a message'
    end,
    case
      when chat_latest.content is null then '[Photo]'
      when chat_latest.content like 'gif:%' then '[GIF]'
      else left(chat_latest.content, 140)
    end,
    jsonb_build_object('message_id', chat_latest.message_id),
    null::timestamptz,
    chat_latest.created_at
  from chat_latest
  join chat_counts on chat_counts.cluster_id = chat_latest.cluster_id

  order by created_at desc
  limit 100;
$$;

create or replace function public.get_unread_notification_count()
returns bigint
language sql stable security definer set search_path = public as $$
  with my_clusters as (
    select cm.cluster_id, cm.last_read_message_at
    from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    left join public.notification_prefs p
      on p.user_id = cm.user_id and p.cluster_id = cm.cluster_id
    where cm.user_id = auth.uid()
      and cm.left_at is null
      and c.introductions_completed_at is not null
      and (p is null or p.messages)
  ),
  chat_clusters as (
    select distinct mc.cluster_id
    from my_clusters mc
    where exists (
      select 1
      from public.messages m
      where m.cluster_id = mc.cluster_id
        and m.deleted_at is null
        and m.moderation_status = 'approved'
        and m.author_id <> auth.uid()
        and m.created_at > mc.last_read_message_at
    )
  )
  select
    (
      select count(*)
      from public.notifications n
      left join public.notification_prefs p
        on p.user_id = n.user_id and p.cluster_id = n.cluster_id
      where n.user_id = auth.uid()
        and n.read_at is null
        and n.type not in ('report_new', 'appeal_new')
        and public.notification_allowed(p, n.type, n.cluster_id)
    )
    + (select count(*) from chat_clusters);
$$;

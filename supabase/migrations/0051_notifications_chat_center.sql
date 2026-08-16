-- 0051_notifications_chat_center.sql
-- 0038 stopped creating `message` notification rows: chat unread now lives in
-- cluster_members.last_read_message_at and only drives the badge, so a plain
-- message bumped the bell count but the notifications center stayed silent —
-- the recipient couldn't see who messaged. This migration re-synthesizes unread
-- chat into get_my_notifications: one `message` entry per cluster that has
-- unread messages, carrying the latest sender and a content preview. The rows
-- are read-only projections of the messages table (nothing is written) and
-- disappear as soon as the cluster is marked read (opening the room or
-- Mark all read), staying consistent with the badge.

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
      and m.author_id <> auth.uid()
      and m.created_at > cm.last_read_message_at
    order by cm.cluster_id, m.created_at desc, m.id desc
  )
  select n.id, n.type, n.cluster_id, n.title, n.body, n.payload, n.read_at, n.created_at
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
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
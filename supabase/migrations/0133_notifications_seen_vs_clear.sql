-- 0133_notifications_seen_vs_clear.sql
-- Seen-vs-clear center: single click keeps the row as read history, only
-- Mark all read empties the page.
--
-- Before (0116), get_my_notifications returned only rows with read_at is null,
-- so marking one notification read removed its card. Now it returns recent
-- read AND unread stored rows (chat entries stay unread-only synthesized rows,
-- consumed by opening the room), so a single read greys the card instead of
-- dropping it. get_unread_notification_count (0114) counts read_at is null
-- rows of this function, so the badge stays correct without changes.
--
-- To keep "Mark all read empties the page", mark_all_read deletes the
-- caller's stored rows instead of marking them read. Chat watermark advances
-- and message_reads freezing are unchanged. No FK references
-- notifications(id); push fan-out happens at insert time into push_outbox.

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
    select
      m.id as message_id,
      m.cluster_id,
      m.content,
      m.created_at,
      pr.display_name,
      row_number() over (
        partition by cm.cluster_id order by m.created_at desc, m.id desc
      ) as rn,
      count(*) over (partition by cm.cluster_id) as message_count
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
    case
      when unread_chat.message_count > 1
        then unread_chat.message_count || ' new messages'
      else unread_chat.display_name || ' sent a message'
    end,
    case
      when unread_chat.content is null then '[Photo]'
      when unread_chat.content like 'gif:%' then '[GIF]'
      else left(unread_chat.content, 140)
    end,
    jsonb_build_object('message_id', unread_chat.message_id),
    null::timestamptz,
    unread_chat.created_at
  from unread_chat
  where unread_chat.rn = 1

  order by created_at desc
  limit 100;
$$;

create or replace function public.mark_all_read() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz;
begin
  v_now := now();

  insert into public.message_reads (message_id, user_id, read_at)
  select m.id, cm.user_id, v_now
  from public.cluster_members cm
  join public.messages m on m.cluster_id = cm.cluster_id
  where cm.user_id = auth.uid()
    and cm.left_at is null
    and m.deleted_at is null
    and m.author_id <> cm.user_id
    and m.created_at > cm.last_read_message_at
    and m.created_at <= v_now
  on conflict (message_id, user_id) do nothing;

  delete from public.notifications
  where user_id = auth.uid();

  update public.cluster_members
  set last_read_message_at = v_now
  where user_id = auth.uid() and left_at is null;
end; $$;

grant execute on function public.mark_all_read() to authenticated;

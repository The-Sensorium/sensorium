-- 0038_last_read_chat.sql
-- Replace the per-message `message` notification rows with last-read tracking
-- for chat. Previously send_message inserted a notification row for every
-- member on every message (~7 rows per message, forever), and the unread badge
-- counted every cluster message even while the member was watching the room.
--
-- Now:
--   1. cluster_members.last_read_message_at marks how far a member has read in
--      each cluster (defaults to join time; existing rows backfill to now()).
--   2. send_message stops creating `message` rows; discrete events (mentions,
--      reactions, votes, signals) still create rows.
--   3. get_unread_notification_count combines discrete unread events with
--      unread chat messages (messages after last_read_message_at, respecting
--      the messages pref and only counting unlocked clusters).
--   4. mark_cluster_read / mark_all_read advance last_read_message_at.
--   5. The `message` notification type stays in the enum for legacy rows.

alter table public.cluster_members
  add column last_read_message_at timestamptz not null default now();

create or replace function public.send_message(
  p_cluster_id uuid,
  p_content text default null,
  p_image_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_msg_id uuid;
  v_mentions uuid[];
begin
  if not (public.is_active_member(p_cluster_id) and public.cluster_unlocked(p_cluster_id)) then
    raise exception 'chat_locked';
  end if;
  if p_content is null and p_image_url is null then raise exception 'empty_message'; end if;

  insert into public.messages (cluster_id, author_id, content, image_url)
  values (p_cluster_id, auth.uid(), p_content, p_image_url)
  returning id into v_msg_id;

  if p_content is not null then
    select array_agg(distinct m.id) into v_mentions
    from public.cluster_members cm
    join public.profiles m on m.id = cm.user_id
    where cm.cluster_id = p_cluster_id
      and cm.left_at is null
      and m.id <> auth.uid()
      and public.is_mentioned(p_content, m.display_name);

    if v_mentions is not null then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select u, 'mention', p_cluster_id,
             (select display_name from public.profiles where id = auth.uid()) || ' mentioned you',
             null,
             jsonb_build_object('message_id', v_msg_id)
      from unnest(v_mentions) as u;
    end if;
  end if;

  return v_msg_id;
end; $$;

create function public.mark_cluster_read(p_cluster_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.cluster_members
  set last_read_message_at = now()
  where cluster_id = p_cluster_id
    and user_id = auth.uid()
    and left_at is null;
end; $$;

create function public.mark_all_read() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;

  update public.cluster_members
  set last_read_message_at = now()
  where user_id = auth.uid() and left_at is null;
end; $$;

create or replace function public.get_unread_notification_count()
returns bigint
language sql stable security definer set search_path = public as $$
  select (
    -- discrete unread events (existing behavior)
    (select count(*)
     from public.notifications n
     left join public.notification_prefs p
       on p.user_id = n.user_id and p.cluster_id = n.cluster_id
     where n.user_id = auth.uid()
       and n.read_at is null
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

grant execute on function public.mark_cluster_read(uuid) to authenticated;
grant execute on function public.mark_all_read() to authenticated;

-- 0024 - Notifications: pref-filtered reads, reaction + message notifications
-- Milestone 11 (Notifications). Follows 0023. Idempotent via db reset.
--
-- The `notifications` table, RLS, and realtime registration already shipped
-- (0008, 0017, 0021). This migration adds:
--   1. Pref-filtered reads (the documented MVP: functions create all rows, the
--      read path filters against notification_prefs so disabled clusters/types
--      never surface in the center or the unread badge).
--   2. `reaction` notifications when someone reacts to your message.
--   3. `message` notifications in send_message (members who were neither the
--      author nor mentioned get one; mentioned members already get `mention`).

-- -- 1) Read-path helpers ---------------------------------------------------

-- Should a notification of `p_type` in `p_cluster_id` be visible given the
-- caller's pref row `p_pref` (null when no pref row exists → all types on)?
-- Global notifications (cluster_id null) are always visible.
create function public.notification_allowed(
  p_pref public.notification_prefs,
  p_type public.notification_type,
  p_cluster_id uuid
) returns boolean
language sql stable as $$
  select case
    when p_cluster_id is null then true
    when p_pref is null then true
    when p_type = 'message' then p_pref.messages
    when p_type = 'mention' then p_pref.mentions
    when p_type = 'reaction' then p_pref.reactions
    when p_type in ('vote_started', 'vote_result', 'replacement') then p_pref.votes
    when p_type = 'invitation_received' then p_pref.invitations
    when p_type = 'signal_new' then p_pref.signals
    else true
  end;
$$;

-- The caller's notifications, newest first, filtered by their prefs (RLS: own rows).
create function public.get_my_notifications()
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
  select n.id, n.type, n.cluster_id, n.title, n.body, n.payload, n.read_at, n.created_at
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
    and public.notification_allowed(p, n.type, n.cluster_id)
  order by n.created_at desc
  limit 100;
$$;

-- Unread count after prefs filtering (drives the header badge).
create function public.get_unread_notification_count()
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*)
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
    and n.read_at is null
    and public.notification_allowed(p, n.type, n.cluster_id);
$$;

-- -- 2) Reaction notifications ----------------------------------------------

-- Fires on message_reactions INSERT: notify the message author (not for their
-- own reactions). Payload carries the message id so the center can deep-link.
create function public.fn_notify_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_cluster uuid;
begin
  select m.author_id, m.cluster_id into v_author, v_cluster
  from public.messages m
  where m.id = new.message_id;

  if v_author is null or v_author = new.user_id then return new; end if;

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  values (
    v_author,
    'reaction',
    v_cluster,
    (select display_name from public.profiles where id = new.user_id) || ' reacted to your message',
    new.emoji,
    jsonb_build_object('message_id', new.message_id, 'emoji', new.emoji)
  );

  return new;
end; $$;

create trigger notifications_on_reaction
after insert on public.message_reactions
for each row execute function public.fn_notify_reaction();

-- -- 3) Message notifications in send_message -------------------------------

-- Extends the M7 send_message (0012) so every new message also notifies the
-- members who were neither the author nor mentioned. Mentioned members already
-- get a targeted `mention` notification; the author gets nothing. Prefs are
-- applied on the read path (see get_my_notifications), keeping this function
-- simple — matching the docs' "filter at read/display time" MVP decision.
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
      and position('@' || lower(m.display_name) in lower(p_content)) > 0;

    if v_mentions is not null then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select u, 'mention', p_cluster_id,
             (select display_name from public.profiles where id = auth.uid()) || ' mentioned you',
             null,
             jsonb_build_object('message_id', v_msg_id)
      from unnest(v_mentions) as u;
    end if;
  end if;

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select cm.user_id, 'message', p_cluster_id,
         (select display_name from public.profiles where id = auth.uid()) || ' sent a message',
         left(coalesce(p_content, '[Photo]'), 140),
         jsonb_build_object('message_id', v_msg_id)
  from public.cluster_members cm
  where cm.cluster_id = p_cluster_id
    and cm.left_at is null
    and cm.user_id <> auth.uid()
    and (v_mentions is null or not (cm.user_id = any(v_mentions)));

  return v_msg_id;
end; $$;

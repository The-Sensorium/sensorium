-- 0046_message_replies.sql
-- Threaded replies in chat. messages.reply_to_id has existed since 0004 (a FK
-- to messages.id with on delete set null) but was never wired up. Extend
-- send_message to accept the parent id, validate that it belongs to the same
-- cluster and isn't deleted, and store it.
--
-- The previous send_message was a 3-arg function (uuid, text, text). Keeping it
-- alongside the new 4-arg signature would leave two overloads, making named-arg
-- calls like send_message(p_cluster_id, p_content) ambiguous to PostgREST. Drop
-- the old overload so the 4-arg version below is the single canonical entry
-- point (all its extra params default, so 2- and 3-arg callers still work).
drop function if exists public.send_message(uuid, text, text);

create or replace function public.send_message(
  p_cluster_id uuid,
  p_content text default null,
  p_image_url text default null,
  p_reply_to_id uuid default null
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

  if p_reply_to_id is not null and not exists (
    select 1 from public.messages
    where id = p_reply_to_id
      and cluster_id = p_cluster_id
      and deleted_at is null
  ) then
    raise exception 'invalid_reply_target';
  end if;

  insert into public.messages (cluster_id, author_id, content, image_url, reply_to_id)
  values (p_cluster_id, auth.uid(), p_content, p_image_url, p_reply_to_id)
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
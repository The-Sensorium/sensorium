-- 0033_mention_word_boundary.sql
-- Mentions now require a word boundary around `@DisplayName`, matching the chat
-- composer's autocomplete and the renderer (src/features/mentions.ts). Before,
-- send_message matched any `@name` substring, so `not@diya` or `me@casey` also
-- created a `mention` notification. A display name is mentioned when a `@`
-- preceded by start-of-string or a non word char is immediately followed by the
-- full name, itself followed by a non word char or end-of-string.

create function public.is_mentioned(
  p_content text,
  p_display_name text
) returns boolean
language plpgsql immutable as $$
declare
  v_lower text := lower(coalesce(p_content, ''));
  v_name  text := lower(p_display_name);
  v_token text := '@' || v_name;
  v_len   int := length(v_token);
  v_base  int := 0;
  v_sub   text := v_lower;
  v_found int;
begin
  if v_name = '' or v_lower = '' then return false; end if;

  loop
    v_found := strpos(v_sub, v_token);
    exit when v_found = 0;

    declare
      v_abs    int := v_base + v_found;
      v_before text := case when v_abs = 1 then null else substring(v_lower, v_abs - 1, 1) end;
      v_after  text := case
        when v_abs + v_len > length(v_lower) then null
        else substring(v_lower, v_abs + v_len, 1)
      end;
    begin
      if (v_before is null or v_before ~ '[^a-z0-9_]')
         and (v_after is null or v_after ~ '[^a-z0-9_]') then
        return true;
      end if;
    end;

    v_base := v_base + v_found;
    v_sub  := substr(v_sub, v_found + 1);
  end loop;

  return false;
end; $$;

-- Re-issue send_message with the boundary-aware mention detection. The `message`
-- notifications for the remaining members are unchanged.
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

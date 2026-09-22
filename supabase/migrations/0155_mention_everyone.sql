-- 0155_mention_everyone.sql
-- Broadcast mention: `@everyone` notifies every other active cluster member
-- through the existing mention pipeline (notifications row + push + email).
--
-- A message mentions everyone when a word-boundary `@` is immediately
-- followed by the literal token `everyone` (case-insensitive), itself
-- followed by a non word char or end of string. The rule mirrors
-- `is_mentioned` (0033): `@everyone!` and `(@everyone)` match, while
-- `me@everyone`, `@everyoneelse`, and `@every` do not.
--
-- Collision: if a member is literally named `Everyone`, the broadcast token
-- wins and that member is still included via the broadcast.
--
-- Fan-out reuses type `mention` with title `<author> mentioned everyone`,
-- same payload shape as per-member mentions. Per-cluster `mentions`
-- opt-outs keep working because the notifications fan-out trigger and
-- `get_my_notifications` gate on `notification_allowed()` downstream.
-- Clusters are capped at 8 members, so one broadcast writes at most 7 rows.

create function public.is_mentioned_everyone(
  p_content text
) returns boolean
language plpgsql immutable as $$
declare
  v_lower text := lower(coalesce(p_content, ''));
  v_token text := '@everyone';
  v_len   int := length(v_token);
  v_base  int := 0;
  v_sub   text := v_lower;
  v_found int;
begin
  if v_lower = '' then return false; end if;

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

-- send_message: live body is 0138 (auth/account guards, 4-arg signature,
-- cluster_unlocked, reply validation, 60/hr rate limit). Only the mention
-- block changes: a broadcast fans out to every other active member.
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
  v_broadcast boolean := false;
  v_author_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

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

  perform public.check_rate_limit('send_message', 60, interval '1 hour');

  insert into public.messages (cluster_id, author_id, content, image_url, reply_to_id)
  values (p_cluster_id, auth.uid(), p_content, p_image_url, p_reply_to_id)
  returning id into v_msg_id;

  if p_content is not null then
    v_broadcast := public.is_mentioned_everyone(p_content);

    if v_broadcast then
      select array_agg(distinct cm.user_id) into v_mentions
      from public.cluster_members cm
      where cm.cluster_id = p_cluster_id
        and cm.left_at is null
        and cm.user_id <> auth.uid();
    else
      select array_agg(distinct m.id) into v_mentions
      from public.cluster_members cm
      join public.profiles m on m.id = cm.user_id
      where cm.cluster_id = p_cluster_id
        and cm.left_at is null
        and m.id <> auth.uid()
        and public.is_mentioned(p_content, m.display_name);
    end if;

    if v_mentions is not null then
      select display_name into v_author_name
      from public.profiles
      where id = auth.uid();

      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select u, 'mention', p_cluster_id,
             v_author_name || case when v_broadcast then ' mentioned everyone' else ' mentioned you' end,
             null,
             jsonb_build_object('message_id', v_msg_id)
      from unnest(v_mentions) as u;
    end if;
  end if;

  return v_msg_id;
end; $$;

-- fan_out_push_for_message: live body is 0153. Only the mentioned-member
-- skip changes so broadcast recipients get the higher-priority `mention`
-- push instead of an additional plain `message` push.
create or replace function public.fan_out_push_for_message()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_body text;
  v_data jsonb;
  v_queued integer;
begin
  if not public.cluster_unlocked(NEW.cluster_id) then
    return NEW;
  end if;

  select coalesce(display_name, 'Someone') into v_title
  from public.profiles
  where id = NEW.author_id;
  v_title := v_title || ' sent a message';

  v_body := case
    when NEW.content is null then '[Photo]'
    when NEW.content like 'gif:%' then '[GIF]'
    else left(NEW.content, 140)
  end;

  v_data := jsonb_strip_nulls(jsonb_build_object(
    'v', 1,
    'kind', 'message',
    'clusterId', NEW.cluster_id
  ));

  insert into public.push_outbox (user_id, type, title, body, data, channel, expo_push_token)
  select cm.user_id, 'message'::public.notification_type, v_title, v_body, v_data, 'messages', pt.expo_push_token
  from public.cluster_members cm
  join public.profiles pr on pr.id = cm.user_id
  join public.push_tokens pt on pt.user_id = cm.user_id
  left join public.notification_prefs p
    on p.user_id = cm.user_id and p.cluster_id = NEW.cluster_id
  where cm.cluster_id = NEW.cluster_id
    and cm.left_at is null
    and cm.user_id <> NEW.author_id
    and not (
      NEW.content is not null
      and (
        public.is_mentioned_everyone(NEW.content)
        or public.is_mentioned(NEW.content, coalesce(pr.display_name, ''))
      )
    )
    and public.notification_allowed(p, 'message'::public.notification_type, NEW.cluster_id)
    and public.is_account_active(cm.user_id);

  get diagnostics v_queued = row_count;
  if v_queued > 0 and pg_try_advisory_xact_lock(hashtext('push-wake')) then
    perform public.wake_push_worker();
  end if;

  return NEW;
end; $$;

drop trigger if exists push_fanout_messages on public.messages;
create trigger push_fanout_messages
  after insert on public.messages
  for each row execute function public.fan_out_push_for_message();

revoke execute on function public.fan_out_push_for_message()
  from public, anon, authenticated;

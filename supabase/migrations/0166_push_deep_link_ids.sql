-- 0166_push_deep_link_ids.sql
-- Push taps land on the exact item, like the in-app Notifications tab does.
-- The push payload (v_data) carried postId/signalId/newMemberId but never the
-- sub-targets, so a post-comment push opened the post at the top and a chat
-- push opened the room at the latest messages. Carry comment_id and
-- message_id through (stripped when null) so the mobile router can append
-- ?comment= / ?message=. Plain chat builds its own payload, so both
-- fan-out functions are re-issued. Live bodies are 0145
-- (fan_out_push_notification) and 0163 (fan_out_push_for_message);
-- all other branches copied verbatim.

create or replace function public.fan_out_push_notification()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pref public.notification_prefs;
  v_data jsonb;
  v_channel text;
  v_queued integer;
begin
  if NEW.cluster_id is not null then
    select * into v_pref
    from public.notification_prefs
    where user_id = NEW.user_id and cluster_id = NEW.cluster_id;
    if not public.notification_allowed(v_pref, NEW.type, NEW.cluster_id) then
      return NEW;
    end if;
  end if;

  if not public.is_account_active(NEW.user_id) then
    return NEW;
  end if;

  if not exists (select 1 from public.push_tokens where user_id = NEW.user_id) then
    return NEW;
  end if;

  v_channel := case
    when NEW.type = 'mention' then 'mentions'
    when NEW.type = 'invitation_received' then 'invites'
    when NEW.type in ('vote_started', 'vote_result', 'replacement', 'report_new', 'appeal_new', 'moderation_notice') then 'governance'
    else 'messages'
  end;

  v_data := jsonb_strip_nulls(jsonb_build_object(
    'v', 1,
    'kind', NEW.type::text,
    'clusterId', NEW.cluster_id,
    'postId', NEW.payload ->> 'post_id',
    'commentId', NEW.payload ->> 'comment_id',
    'messageId', NEW.payload ->> 'message_id',
    'signalId', NEW.payload ->> 'signal_id',
    'newMemberId', NEW.payload ->> 'new_member_id'
  ));

  -- One row per registered token; each delivery is self-contained so status
  -- and attempts are tracked per device, not shared across a user's devices.
  insert into public.push_outbox (user_id, type, title, body, data, channel, expo_push_token)
  select NEW.user_id, NEW.type, NEW.title, NEW.body, v_data, v_channel, pt.expo_push_token
  from public.push_tokens pt
  where pt.user_id = NEW.user_id;

  get diagnostics v_queued = row_count;
  -- Collapse per-row wakes to one per transaction: concurrent transactions
  -- each wake at most once, and the cron pump covers any skipped rows.
  if v_queued > 0 and pg_try_advisory_xact_lock(hashtext('push-wake')) then
    perform public.wake_push_worker();
  end if;

  return NEW;
end; $$;

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
    'clusterId', NEW.cluster_id,
    'messageId', NEW.id
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
    and not exists (
      select 1 from public.user_mutes m
      where m.user_id = cm.user_id and m.muted_user_id = NEW.author_id
    )
    and public.notification_allowed(p, 'message'::public.notification_type, NEW.cluster_id)
    and public.is_account_active(cm.user_id);

  get diagnostics v_queued = row_count;
  if v_queued > 0 and pg_try_advisory_xact_lock(hashtext('push-wake')) then
    perform public.wake_push_worker();
  end if;

  return NEW;
end; $$;

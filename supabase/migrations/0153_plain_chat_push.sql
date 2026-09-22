-- 0153_plain_chat_push.sql
-- OS push for plain chat messages.
--
-- Plain chat writes no `notifications` row (synthesized at read time since
-- 0038), so the notifications fan-out trigger (0100/0102/0103/0137/0145)
-- never fires for it: mentions, reactions, votes and the rest push, but a
-- regular message stays silent on the device. The inbox stays as-is
-- (ephemeral synthesized entries, one row per cluster with "N new messages",
-- disappearing on read); only push delivery is added.
--
-- A new AFTER INSERT trigger on `messages` fans out straight into
-- `push_outbox` (one row per recipient token), mirroring the notifications
-- gating: per-cluster `messages` pref via `notification_allowed`, active
-- account, registered token, unlocked cluster. The author is skipped, and
-- mentioned members are skipped (they already get the higher-priority
-- `mention` push from `send_message`, which explicitly excludes them from
-- the plain audience too). Title/body preview mirrors `get_my_notifications`
-- (`[Photo]` / `[GIF]` / 140 chars). The wake collapses to one per
-- transaction on the shared `push-wake` advisory lock, so a message that
-- also emits mentions still wakes at most once.

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
      and public.is_mentioned(NEW.content, coalesce(pr.display_name, ''))
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

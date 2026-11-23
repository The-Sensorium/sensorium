-- 0213_incoming_call_alerts.sql
-- App-wide ringing for cluster calls. start_call writes one ephemeral
-- incoming_call notification per other active member; the existing push
-- fan-out turns each row into a per-device push. The rows are hidden from the
-- notification center and deleted when the call ends, so they stay signal-only.
-- Calls bypass the per-cluster push mute: muting chat should not hide a call.

-- -- Push channel (live constraint is 0202) ------------------------------------
alter table public.push_outbox drop constraint if exists push_outbox_channel_check;
alter table public.push_outbox
  add constraint push_outbox_channel_check
  check (channel in ('messages', 'messages-quiet', 'mentions', 'invites', 'governance', 'calls'));

-- -- Push fan-out (live body is 0205) ------------------------------------------
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
    if NEW.type <> 'incoming_call' and public.push_muted(v_pref) then
      return NEW;
    end if;
  end if;

  if not public.is_account_active_internal(NEW.user_id) then
    return NEW;
  end if;

  if not exists (select 1 from public.push_tokens where user_id = NEW.user_id) then
    return NEW;
  end if;

  v_channel := case
    when NEW.type = 'mention' then 'mentions'
    when NEW.type = 'invitation_received' then 'invites'
    when NEW.type = 'incoming_call' then 'calls'
    when NEW.type in ('vote_started', 'vote_result', 'replacement', 'report_new', 'appeal_new', 'moderation_notice', 'meetup_invite', 'meetup_confirmed', 'meetup_reminder_24h', 'meetup_reminder_15m', 'meetup_starting') then 'governance'
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
    'newMemberId', NEW.payload ->> 'new_member_id',
    'meetupId', NEW.payload ->> 'meetup_id',
    'callId', NEW.payload ->> 'call_id'
  ));

  insert into public.push_outbox (user_id, type, title, body, data, channel, expo_push_token)
  select NEW.user_id, NEW.type, NEW.title, NEW.body, v_data, v_channel, pt.expo_push_token
  from public.push_tokens pt
  where pt.user_id = NEW.user_id;

  get diagnostics v_queued = row_count;
  if v_queued > 0 and pg_try_advisory_xact_lock(hashtext('push-wake')) then
    perform public.wake_push_worker();
  end if;

  return NEW;
end; $$;

-- -- Inbox reads (live bodies are 0156) ---------------------------------------
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
  select n.id, n.type, n.cluster_id, n.title, n.body, n.payload, n.read_at, n.created_at
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
    and n.type not in ('report_new', 'appeal_new', 'incoming_call')
    and public.notification_allowed(p, n.type, n.cluster_id)

  order by created_at desc
  limit 100;
$$;

create or replace function public.get_unread_notification_count()
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*)
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
    and n.read_at is null
    and n.type not in ('report_new', 'appeal_new', 'incoming_call')
    and public.notification_allowed(p, n.type, n.cluster_id);
$$;

-- -- Ring row cleanup ---------------------------------------------------------
create or replace function public.clear_call_ring_notifications()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications
  where type = 'incoming_call'
    and payload ->> 'call_id' = NEW.id::text;
  -- A ring that is still queued after the call ended is stale; drop it so a
  -- slow worker cannot notify about a call nobody can join.
  delete from public.push_outbox
  where type = 'incoming_call'
    and status = 'queued'
    and data ->> 'callId' = NEW.id::text;
  return NEW;
end; $$;

drop trigger if exists calls_clear_ring_notifications on public.calls;
create trigger calls_clear_ring_notifications
  after update of status on public.calls
  for each row
  when (old.status is distinct from new.status and new.status = 'ended')
  execute function public.clear_call_ring_notifications();

-- -- start_call (live body is 0139) -------------------------------------------
create or replace function public.start_call(p_cluster_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_status public.cluster_status;
  v_cluster_name text;
  v_name text;
  v_live uuid;
  v_open int;
begin
  if v_me is null then raise exception 'not_signed_in'; end if;
  if not public.is_account_active(v_me) then raise exception 'account_inactive'; end if;
  if not public.is_active_member(p_cluster_id) then raise exception 'not_member'; end if;

  select status, name into v_status, v_cluster_name
  from public.clusters where id = p_cluster_id;
  if not found then raise exception 'cluster_not_found'; end if;
  if v_status = 'archived' then raise exception 'cluster_archived'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_cluster_id::text, 0));

  update public.calls
  set status = 'ended', ended_at = coalesce(ended_at, now())
  where cluster_id = p_cluster_id and status in ('ringing', 'active') and expires_at <= now();

  update public.call_participants cp
  set left_at = coalesce(cp.left_at, now())
  from public.calls c
  where cp.call_id = c.id and cp.left_at is null and c.status = 'ended'
    and c.cluster_id = p_cluster_id;

  select id into v_live
  from public.calls
  where cluster_id = p_cluster_id and status in ('ringing', 'active')
  order by created_at desc
  limit 1;
  if found then
    select count(*) into v_open
    from public.call_participants
    where call_id = v_live and left_at is null and user_id is distinct from v_me;
    if v_open >= 8 then raise exception 'call_full'; end if;

    insert into public.call_participants (call_id, user_id, cluster_id)
    values (v_live, v_me, p_cluster_id)
    on conflict (call_id, user_id)
    do update set left_at = null, joined_at = now();
    return v_live;
  end if;

  insert into public.calls (cluster_id, initiated_by)
  values (p_cluster_id, v_me)
  returning id into v_live;

  insert into public.call_participants (call_id, user_id, cluster_id)
  values (v_live, v_me, p_cluster_id);

  select display_name into v_name from public.profiles where id = v_me;

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select cm.user_id,
         'incoming_call'::public.notification_type,
         p_cluster_id,
         coalesce(v_name, 'A member') || ' started a call',
         coalesce(v_cluster_name, 'Your cluster') || '. Tap to join.',
         jsonb_build_object('call_id', v_live)
  from public.cluster_members cm
  where cm.cluster_id = p_cluster_id
    and cm.left_at is null
    and cm.user_id <> v_me;

  return v_live;
end; $$;

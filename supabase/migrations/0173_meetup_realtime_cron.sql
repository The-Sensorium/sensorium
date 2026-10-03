-- 0173_meetup_realtime_cron.sql
-- Realtime, notification prefs routing, push fan-out, and cron for meetups.
-- Follows the 0021/0023 realtime, 0080 prefs, 0170 push, and 0039 cron patterns.
-- After applying locally, restart the stack for realtime to pick up the tables.

-- Route meetup notifications through the existing votes preference so no
-- settings UI change is needed in v1.
create or replace function public.notification_allowed(
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
    when p_type in ('meetup_invite', 'meetup_confirmed', 'meetup_reminder_24h', 'meetup_reminder_15m', 'meetup_starting') then p_pref.votes
    when p_type = 'invitation_received' then p_pref.invitations
    when p_type = 'signal_new' then p_pref.signals
    when p_type = 'post_comment' then p_pref.post_comment
    when p_type = 'post_like' then p_pref.post_like
    when p_type = 'moderation_notice' then true
    else true
  end;
$$;

-- Push fan-out with meetup kinds on the governance channel plus meetup_id in
-- the data payload for deep links. Body matches 0170 with only the channel
-- list, data field, and helper reference changed.
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

  if not public.is_account_active_internal(NEW.user_id) then
    return NEW;
  end if;

  if not exists (select 1 from public.push_tokens where user_id = NEW.user_id) then
    return NEW;
  end if;

  v_channel := case
    when NEW.type = 'mention' then 'mentions'
    when NEW.type = 'invitation_received' then 'invites'
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
    'meetupId', NEW.payload ->> 'meetup_id'
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

alter publication supabase_realtime add table
  public.meetups,
  public.meetup_slots,
  public.meetup_votes,
  public.meetup_rsvps,
  public.meetup_feedback;

insert into realtime.subscription (subscription_id, entity, claims)
select gen_random_uuid(), t.e::regclass, jsonb_build_object('role', 'authenticated')
from unnest(array[
  'meetups',
  'meetup_slots',
  'meetup_votes',
  'meetup_rsvps',
  'meetup_feedback'
]) as t(e);

select cron.unschedule('meetup-expire')
where exists (select 1 from cron.job where jobname = 'meetup-expire');
select cron.schedule('meetup-expire', '*/5 * * * *', $$select public.expire_meetups()$$);

select cron.unschedule('meetup-remind')
where exists (select 1 from cron.job where jobname = 'meetup-remind');
select cron.schedule('meetup-remind', '* * * * *', $$select public.pump_meetup_reminders()$$);

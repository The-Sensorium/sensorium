-- 0102_push_outbox_per_token.sql
-- Rework push_outbox so each row is one delivery to one device token, instead
-- of one row per notification joined against push_tokens at claim time.
--
-- The 0100 shape had two correctness bugs for multi-token users (the plan
-- explicitly supports several devices per user):
--   1. A single outbox row was returned once per registered token by the
--      claim join, while status/attempts were tracked per outbox row. One
--      stale token (reinstall without unregister) made the healthy device get
--      re-notified on every retry, and a multi-token row dead-lettered
--      prematurely (attempts counted once per token per round).
--   2. After a DeviceNotRegistered response deletes the only token, the row
--      had no token left to join for re-claiming, so it sat in 'failed' with
--      attempts < 5 forever instead of reaching the dead-letter state.
--
-- Storing the token on the row makes each delivery self-contained: claim no
-- longer joins push_tokens, retry/dead-letter bookkeeping is per token, and
-- removing a token never strands its rows. The worker's mark/delete logic is
-- unchanged (it already handled rows individually).

alter table public.push_outbox
  add column expo_push_token text;

create or replace function public.fan_out_push_notification()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pref public.notification_prefs;
  v_data jsonb;
  v_channel text;
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
    'signalId', NEW.payload ->> 'signal_id'
  ));

  -- One row per registered token; each delivery is self-contained so status
  -- and attempts are tracked per device, not shared across a user's devices.
  insert into public.push_outbox (user_id, type, title, body, data, channel, expo_push_token)
  select NEW.user_id, NEW.type, NEW.title, NEW.body, v_data, v_channel, pt.expo_push_token
  from public.push_tokens pt
  where pt.user_id = NEW.user_id;

  return NEW;
end; $$;

create or replace function public.claim_push_notifications(p_limit integer default 20)
returns table (
  id uuid,
  expo_push_token text,
  title text,
  body text,
  data jsonb,
  channel text
)
language sql security definer set search_path = public as $$
  with batch as (
    select oe.id
    from public.push_outbox oe
    where oe.status = 'queued'
       or (oe.status = 'failed' and oe.attempts < 5)
    order by oe.created_at asc, oe.id asc
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.push_outbox oe
  set status = 'sending', updated_at = now()
  from batch b
  where oe.id = b.id
  returning oe.id, oe.expo_push_token, oe.title, oe.body, oe.data, oe.channel;
$$;

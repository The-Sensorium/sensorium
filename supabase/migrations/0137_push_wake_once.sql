-- 0137_push_wake_once.sql
-- Perf: fan_out_push_notification (0103) called wake_push_worker() ->
-- net.http_post once per notification ROW. A single user action that fans out
-- to 8 members (vote start/result, replacement, cluster_formed) queued 8
-- http_posts inside the originating transaction, waking 8 send-push workers
-- that raced for the same rows (most claimed empty). Multi-device users made
-- it worse via the per-token rows (0102).
--
-- Re-created from the 0103 definition with identical gating and per-token
-- rows; only the wake is collapsed: the first row in the transaction to queue
-- anything takes pg_try_advisory_xact_lock('push-wake') and wakes once, the
-- rest skip. One user action = at most one wake per transaction; concurrent
-- transactions each wake at most once, and the woken worker claims across all
-- committed queued rows (claim uses SKIP LOCKED). The per-minute push-pump
-- stays as the recovery net for the rare interleaving where a skipped wake's
-- rows commit after the woken worker already claimed (same delay as the
-- pre-0103 pump-only behavior, not a loss).

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
    'signalId', NEW.payload ->> 'signal_id'
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

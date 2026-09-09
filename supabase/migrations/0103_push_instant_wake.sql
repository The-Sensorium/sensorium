-- 0103_push_instant_wake.sql
-- Make OS push near-real-time. Previously the cron pump (once a minute) was
-- the only thing that woke the send-push Edge Function, so a mention took up
-- to ~60s to arrive as a push. Now the fan-out trigger fires a wake immediately
-- after queueing outbox rows, so delivery happens within a second or two.
--
-- The cron pump stays as the recovery safety net: it still re-claims anything
-- the wake missed (worker down, DB restart, network blip), and it now shares
-- the same single http_post helper instead of duplicating it.

-- -- 1) Shared wake helper ------------------------------------------------------
-- Fire-and-forget POST to the configured send-push endpoint. Reads the same
-- push_settings row the pump uses; no-op when not wired/enabled. pg_net queues
-- the request and dispatches it asynchronously, so calling it inside the
-- fan-out trigger is safe (a rolled-back insert never sends).

create or replace function public.wake_push_worker()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_edge_url text;
  v_secret text;
  v_enabled boolean;
begin
  select edge_url, secret, enabled
    into v_edge_url, v_secret, v_enabled
  from public.push_settings
  where id = true;

  if not coalesce(v_enabled, false) or v_edge_url is null then
    return;
  end if;

  perform net.http_post(
    url := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_secret, '')
    ),
    body := '{}'::jsonb
  );
end; $$;

-- -- 2) Fan-out trigger wakes the worker ---------------------------------------
-- Same gates as 0102 (prefs, account active, at least one token); on top of
-- inserting the per-token rows it now pokes the worker so delivery is
-- immediate rather than waiting for the next cron tick.

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
  if v_queued > 0 then
    perform public.wake_push_worker();
  end if;

  return NEW;
end; $$;

-- -- 3) Cron pump reuses the helper (recovery safety net) ----------------------

create or replace function public.pump_push_notifications()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pending boolean;
begin
  select exists (
    select 1 from public.push_outbox
    where status = 'queued'
       or (status = 'failed' and attempts < 5)
  ) into v_pending;

  if v_pending then
    perform public.wake_push_worker();
  end if;
end; $$;

-- -- 4) Grants -----------------------------------------------------------------

revoke execute on function
  public.wake_push_worker()
  from public, anon, authenticated;

-- 0100_push_outbox.sql
-- OS-level push delivery for mobile. Adds a durable push_outbox queue written
-- by an AFTER INSERT trigger on public.notifications (one place, so every
-- present and future notification type flows through the same prefs gate),
-- plus the claim/mark lifecycle for the Edge Function worker and the pg_cron
-- pump. Mirrors the 0068/0071 email outbox pattern.
--
-- Deviation from docs/PUSH_NOTIFICATIONS_PLAN.md §3: the plan sketches a
-- queue_push_notification() call added at each notification insert site (~40
-- sites). A trigger is equivalent in behavior, far less invasive, and cannot
-- be forgotten by future migrations.

-- -- 1) Table -----------------------------------------------------------------

create table public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  channel text not null default 'messages'
    check (channel in ('messages', 'mentions', 'invites', 'governance')),
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'abandoned')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index push_outbox_queue_idx
  on public.push_outbox (status, created_at)
  where status in ('queued', 'sending');

create index push_outbox_user_idx
  on public.push_outbox (user_id, created_at desc);

alter table public.push_outbox enable row level security;

-- -- 2) Fan-out trigger --------------------------------------------------------
-- Runs on every notification insert. Skips silently when the recipient turned
-- the type off in Settings (notification_allowed over their per-cluster
-- prefs), is restricted, or has no registered push token. Otherwise snapshots
-- the title/body plus a versioned deep-link payload (v1 contract shared with
-- mobile/src/lib/notification-routing.ts).

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

  insert into public.push_outbox (user_id, type, title, body, data, channel)
  values (NEW.user_id, NEW.type, NEW.title, NEW.body, v_data, v_channel);

  return NEW;
end; $$;

drop trigger if exists push_fanout on public.notifications;
create trigger push_fanout
  after insert on public.notifications
  for each row execute function public.fan_out_push_notification();

-- -- 3) Claim + mark (Edge Function lifecycle) ---------------------------------
-- One outbox row fans out to every registered token of the recipient, so the
-- worker claims per-token rows; claiming flips queued -> sending atomically.

create function public.claim_push_notifications(p_limit integer default 20)
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
    select oe.id, pt.expo_push_token
    from public.push_outbox oe
    join public.push_tokens pt on pt.user_id = oe.user_id
    where oe.status = 'queued'
       or (oe.status = 'failed' and oe.attempts < 5)
    order by oe.created_at asc, oe.id asc
    limit greatest(1, least(p_limit, 100))
    for update of oe skip locked
  )
  update public.push_outbox oe
  set status = 'sending', updated_at = now()
  from batch b
  where oe.id = b.id
  returning oe.id, b.expo_push_token, oe.title, oe.body, oe.data, oe.channel;
$$;

create function public.mark_push_notification(
  p_id uuid,
  p_status text,
  p_error text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid_push_status';
  end if;

  update public.push_outbox
  set status = case
        when p_status = 'failed' and attempts + 1 >= 5 then 'abandoned'
        else p_status
      end,
      attempts = attempts + 1,
      last_error = coalesce(p_error, last_error),
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      updated_at = now()
  where id = p_id;
end; $$;

-- -- 4) Recovery sweep ---------------------------------------------------------

create function public.recover_stuck_push_sending()
returns void
language sql security definer set search_path = public as $$
  update public.push_outbox
  set status = 'queued', updated_at = now()
  where status = 'sending'
    and updated_at < now() - interval '2 minutes';
$$;

-- -- 5) Settings + pump (pg_cron -> Edge Function via pg_net) -----------------

create table public.push_settings (
  id boolean primary key default true check (id),
  edge_url text,
  secret text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.push_settings (id, edge_url, secret, enabled)
values (true, null, null, false);

alter table public.push_settings enable row level security;

create function public.pump_push_notifications()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_edge_url text;
  v_secret text;
  v_enabled boolean;
  v_pending boolean;
begin
  select edge_url, secret, enabled
    into v_edge_url, v_secret, v_enabled
  from public.push_settings
  where id = true;

  if not coalesce(v_enabled, false) or v_edge_url is null then
    return;
  end if;

  select exists (
    select 1 from public.push_outbox
    where status = 'queued'
       or (status = 'failed' and attempts < 5)
  ) into v_pending;

  if not v_pending then
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

select cron.unschedule('push-pump')
where exists (select 1 from cron.job where jobname = 'push-pump');
select cron.schedule('push-pump', '* * * * *', $$select public.pump_push_notifications()$$);

select cron.unschedule('push-recover')
where exists (select 1 from cron.job where jobname = 'push-recover');
select cron.schedule('push-recover', '*/5 * * * *', $$select public.recover_stuck_push_sending()$$);

-- -- 6) Grants -----------------------------------------------------------------
-- The client never touches the outbox or settings; the service-role worker
-- owns the queue and the pg_cron postgres role runs the pump/recovery.

revoke all on table public.push_outbox from anon, authenticated;
grant select, insert, update, delete on public.push_outbox to service_role;

revoke all on table public.push_settings from anon, authenticated;
grant select on public.push_settings to service_role;

revoke execute on function
  public.fan_out_push_notification(),
  public.claim_push_notifications(integer),
  public.mark_push_notification(uuid, text, text),
  public.recover_stuck_push_sending(),
  public.pump_push_notifications()
  from public, anon, authenticated;

grant execute on function
  public.claim_push_notifications(integer),
  public.mark_push_notification(uuid, text, text),
  public.recover_stuck_push_sending()
  to service_role;

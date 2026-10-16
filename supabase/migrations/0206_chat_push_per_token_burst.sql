-- 0206_chat_push_per_token_burst.sql
-- Fix burst lines diverging across a user's devices.
--
-- 0204 accumulated lines per row, but two gaps combined into a wrong
-- shade: fresh rows were inserted per user (one straggler row still queued
-- suppressed inserts for every other token, freezing their rows without
-- the new line), and inheritance picked the latest-updated rather than
-- the most complete row, stepping backward past content sitting in other
-- rows. A shade showing "4 new messages" with line 4 missing was the
-- result.
--
-- Two surgical changes, nothing else moves: fresh rows are inserted per
-- token (any token without a pending row gets one, so no device is left
-- frozen), and inheritance takes the longest recent row (count, then
-- recency) instead of the latest-updated one. The inherit source stays
-- sent/sending only on purpose: the merge already appended this message
-- to every queued row earlier in the same transaction, so reading queued
-- rows back here would append the same line twice. Mute, mention, prefs,
-- channels, lock, dedupe, wake, and the bundling flag are unchanged.

create or replace function public.fan_out_push_for_message()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_sender text;
  v_cluster text;
  v_line text;
  v_title text;
  v_body text;
  v_data jsonb;
  v_queued integer := 0;
  v_merged integer := 0;
  v_bundling boolean := false;
  c_coalesce_seconds integer := 120;
begin
  if not public.cluster_unlocked(NEW.cluster_id) then
    return NEW;
  end if;

  -- Serialize concurrent fan-outs for one cluster: two messages landing at
  -- once must not both miss the queued row and insert duplicate loud rows.
  -- Transaction-scoped, released at commit, so stalls are impossible.
  perform pg_advisory_xact_lock(hashtext('push-burst-' || NEW.cluster_id::text));

  select coalesce(
    (select bundling_enabled from public.push_settings where id = true),
    false
  ) into v_bundling;

  select coalesce(display_name, 'Someone') into v_sender
  from public.profiles
  where id = NEW.author_id;
  select name into v_cluster
  from public.clusters
  where id = NEW.cluster_id;
  if v_cluster is null or v_cluster = '' then
    v_cluster := 'Sensorium';
  end if;

  v_body := case
    when NEW.audio_url is not null then
      'Voice note (' || (NEW.audio_duration_sec / 60)::text || ':'
        || lpad((NEW.audio_duration_sec % 60)::text, 2, '0') || ')'
    when NEW.content is null then '[Photo]'
    when NEW.content like 'gif:%' then '[GIF]'
    else left(NEW.content, 140)
  end;
  v_line := v_sender || ': ' || v_body;
  v_title := v_cluster;
  v_body := v_line;

  v_data := jsonb_strip_nulls(jsonb_build_object(
    'v', 1,
    'kind', 'message',
    'clusterId', NEW.cluster_id,
    'messageId', NEW.id,
    'count', 1,
    'lines', jsonb_build_array(v_line)
  ));

  -- 1) Merge into the recipient's still-queued burst row for this cluster.
  -- Rolling the preview forward in place means the worker sends one push
  -- per burst, not one per message. All of the user's queued device rows
  -- roll together so multi-token users stay consistent.
  with recipients as (
    select cm.user_id
    from public.cluster_members cm
    join public.profiles pr on pr.id = cm.user_id
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
      and not public.push_muted(p)
      and public.is_account_active_internal(cm.user_id)
      and exists (
        select 1 from public.push_tokens pt where pt.user_id = cm.user_id
      )
  ),
  merged as (
    select o.id,
      public.push_burst_lines(o.data -> 'lines', v_line) as nl,
      coalesce(nullif(o.data ->> 'count', '')::integer, 1) + 1 as nc
    from public.push_outbox o
    join recipients r on o.user_id = r.user_id
    where o.type = 'message'::public.notification_type
      and o.status = 'queued'
      and o.data ->> 'clusterId' = NEW.cluster_id::text
  ),
  composed as (
    select m.id, m.nl, m.nc,
      case
        when m.nc > 1 then v_cluster || ' · ' || m.nc || ' new messages'
        else v_cluster
      end as nt,
      public.push_burst_body(m.nl) as nb
    from merged m
  )
  update public.push_outbox o
  set title = c.nt,
      body = c.nb,
      data = o.data || jsonb_build_object(
        'count', c.nc,
        'lines', c.nl,
        'latestMessageId', NEW.id,
        'messageId', NEW.id
      ),
      updated_at = now()
  from composed c
  where o.id = c.id;

  get diagnostics v_merged = row_count;

  -- Collapse duplicate queued rows for one device to a single row. The lock
  -- above stops new duplicates, but rows queued before this migration (or
  -- from a past race) would otherwise each send and buzz. All copies were
  -- just refreshed to the same lines, so any one of them will do; keep
  -- the oldest per device. One row per token is correct for multi-token
  -- users, so the token is part of the dedupe key.
  delete from public.push_outbox a
  using public.push_outbox b
  where a.user_id = b.user_id
    and a.expo_push_token is not distinct from b.expo_push_token
    and a.type = 'message'::public.notification_type
    and b.type = 'message'::public.notification_type
    and a.status = 'queued'
    and b.status = 'queued'
    and a.data ->> 'clusterId' = NEW.cluster_id::text
    and b.data ->> 'clusterId' = NEW.cluster_id::text
    and (a.created_at, a.id) > (b.created_at, b.id);

  -- 2) Tokens without a pending burst row get a fresh row each. The old
  -- user-level guard let one straggler row suppress inserts for every
  -- other token, freezing their rows without the new line. A quiet
  -- follow-up (previous push inside the window and unread) continues the
  -- current burst, inheriting the longest recent lines; a loud row after
  -- read or window expiry starts a new burst with exactly its own line
  -- and can never resurrect older messages.
  insert into public.push_outbox (user_id, type, title, body, data, channel, expo_push_token)
  select cm.user_id, 'message'::public.notification_type,
    case
      when prev.pd is not null and v_bundling
        then v_cluster || ' · ' || (prev.pc + 1) || ' new messages'
      else v_cluster
    end,
    case
      when prev.pd is not null and v_bundling
        then public.push_burst_body(public.push_burst_lines(prev.pl, v_line))
      else v_line
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'v', 1,
      'kind', 'message',
      'clusterId', NEW.cluster_id,
      'messageId', NEW.id,
      'count', case when prev.pd is not null and v_bundling then prev.pc + 1 else 1 end,
      'lines', case when prev.pd is not null and v_bundling
        then public.push_burst_lines(prev.pl, v_line)
        else jsonb_build_array(v_line) end
    )),
    case
      when prev.pd is not null and v_bundling then 'messages-quiet'
      else 'messages'
    end,
    pt.expo_push_token
  from public.cluster_members cm
  join public.profiles pr on pr.id = cm.user_id
  join public.push_tokens pt on pt.user_id = cm.user_id
  left join public.notification_prefs p
    on p.user_id = cm.user_id and p.cluster_id = NEW.cluster_id
  left join lateral (
    select o2.data as pd,
      o2.data -> 'lines' as pl,
      coalesce(nullif(o2.data ->> 'count', '')::integer, 1) as pc
    from public.push_outbox o2
    where o2.user_id = cm.user_id
      and o2.type = 'message'::public.notification_type
      and o2.data ->> 'clusterId' = NEW.cluster_id::text
      and (
        (o2.status = 'sent' and o2.sent_at > now() - make_interval(secs => c_coalesce_seconds)
          and o2.sent_at > cm.last_read_message_at)
        or (o2.status = 'sending' and o2.updated_at > now() - make_interval(secs => c_coalesce_seconds)
          and o2.updated_at > cm.last_read_message_at)
      )
    order by coalesce(nullif(o2.data ->> 'count', '')::integer, 1) desc, o2.updated_at desc
    limit 1
  ) prev on true
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
    and not public.push_muted(p)
    and public.is_account_active_internal(cm.user_id)
    and not exists (
      select 1 from public.push_outbox o3
      where o3.user_id = cm.user_id
        and o3.expo_push_token is not distinct from pt.expo_push_token
        and o3.type = 'message'::public.notification_type
        and o3.status = 'queued'
        and o3.data ->> 'clusterId' = NEW.cluster_id::text
    );

  get diagnostics v_queued = row_count;
  if (v_queued + v_merged) > 0 and pg_try_advisory_xact_lock(hashtext('push-wake')) then
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

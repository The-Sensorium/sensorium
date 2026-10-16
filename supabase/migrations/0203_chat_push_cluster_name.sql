-- 0203_chat_push_cluster_name.sql
-- Name the cluster in plain-chat push titles.
--
-- Bundled pushes (0202) show one row per cluster, but the title is only
-- "<sender> sent a message": with several active clusters the rows are
-- indistinguishable. clusters.name is NOT NULL, so stamp it into the
-- title as "<sender> in <cluster>". Body, coalescing, quiet routing, and
-- all other types are unchanged.

create or replace function public.fan_out_push_for_message()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_sender text;
  v_cluster text;
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
  v_title := case
    when v_cluster is null or v_cluster = '' then v_sender || ' sent a message'
    else v_sender || ' in ' || v_cluster
  end;

  v_body := case
    when NEW.audio_url is not null then
      'Voice note (' || (NEW.audio_duration_sec / 60)::text || ':'
        || lpad((NEW.audio_duration_sec % 60)::text, 2, '0') || ')'
    when NEW.content is null then '[Photo]'
    when NEW.content like 'gif:%' then '[GIF]'
    else left(NEW.content, 140)
  end;

  v_data := jsonb_strip_nulls(jsonb_build_object(
    'v', 1,
    'kind', 'message',
    'clusterId', NEW.cluster_id,
    'messageId', NEW.id,
    'count', 1
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
      and public.is_account_active_internal(cm.user_id)
      and exists (
        select 1 from public.push_tokens pt where pt.user_id = cm.user_id
      )
  )
  update public.push_outbox o
  set title = v_title,
      body = v_body,
      data = o.data || jsonb_build_object(
        'count', coalesce(nullif(o.data ->> 'count', '')::integer, 1) + 1,
        'latestMessageId', NEW.id,
        'messageId', NEW.id
      ),
      updated_at = now()
  from recipients r
  where o.user_id = r.user_id
    and o.type = 'message'::public.notification_type
    and o.status = 'queued'
    and o.data ->> 'clusterId' = NEW.cluster_id::text;

  get diagnostics v_merged = row_count;

  -- Collapse duplicate queued rows for one device to a single row. The lock
  -- above stops new duplicates, but rows queued before this migration (or
  -- from a past race) would otherwise each send and buzz. All copies were
  -- just refreshed to the same preview, so any one of them will do; keep
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

  -- 2) Recipients with no pending burst row get a fresh row: quiet when the
  -- previous push for this cluster is still inside the window and the
  -- recipient has not read since, loud otherwise (new burst after reading).
  insert into public.push_outbox (user_id, type, title, body, data, channel, expo_push_token)
  select cm.user_id, 'message'::public.notification_type, v_title, v_body, v_data,
    case
      when v_bundling and exists (
        select 1 from public.push_outbox o2
        where o2.user_id = cm.user_id
          and o2.type = 'message'::public.notification_type
          and o2.data ->> 'clusterId' = NEW.cluster_id::text
          and (
            (o2.status = 'sent' and o2.sent_at > now() - make_interval(secs => c_coalesce_seconds)
              and o2.sent_at > cm.last_read_message_at)
            or (o2.status = 'sending' and o2.updated_at > now() - make_interval(secs => c_coalesce_seconds)
              and o2.updated_at > cm.last_read_message_at)
          )
      )
      then 'messages-quiet'
      else 'messages'
    end,
    pt.expo_push_token
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
    and public.is_account_active_internal(cm.user_id)
    and not exists (
      select 1 from public.push_outbox o3
      where o3.user_id = cm.user_id
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

-- 0200_voice_notes.sql
-- Cluster-chat voice notes (web + mobile): audio message columns, private
-- storage bucket, member-scoped storage policies, extended send_message RPC
-- with duration/MIME/path validation, voice-aware plain-chat push preview,
-- server-side voice object cleanup on delete, and a no-edit guard for audio
-- rows.
--
-- Conventions: private bucket + signed URLs, bare storage path persisted
-- (voice-notes/{cluster_id}/{message_id}.m4a), first path segment is the
-- owning cluster id gated by is_active_member, same as chat-images
-- (0021/0030/0031/0050). No new realtime publication: messages already
-- publishes. No transcription in v1 (peaks are stored for future use).

-- 1) Columns on messages. Waveform is a small JSON array of normalized
-- peaks (0..1), downsampled client-side, capped at 64 entries.
alter table public.messages
  add column audio_url text,
  add column audio_duration_sec integer,
  add column audio_waveform jsonb,
  add column audio_mime text;

-- 2) Content check: a message needs text, an image, or audio.
alter table public.messages drop constraint if exists has_content;
alter table public.messages
  add constraint messages_has_content
  check (content is not null or image_url is not null or audio_url is not null);

-- 3) Audio field coherence: duration 1..120s (2 minute cap), MIME from the
-- allowlist, path scoped to the owning cluster (same convention the storage
-- policies enforce), no image or caption alongside audio (no client renders
-- them), waveform optional but bounded. Direct INSERTs bypass the RPC, so
-- these rules live here as well as in send_message.
alter table public.messages
  add constraint messages_audio_fields_valid
  check (
    (audio_url is null and audio_duration_sec is null and audio_waveform is null and audio_mime is null)
    or (
      audio_url is not null
      and audio_url like (cluster_id::text || '/%')
      and audio_duration_sec is not null
      and audio_duration_sec between 1 and 120
      and audio_mime in ('audio/mp4', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/mpeg')
      and image_url is null
      and content is null
      and (audio_waveform is null or jsonb_array_length(audio_waveform) <= 64)
    )
  );

-- 4) Private bucket. 5 MB cap matches chat-images. AAC-first clients store
-- audio/mp4 or audio/m4a; Opus containers stay allowed on ingest for
-- tolerance and can be tightened later once no rows use them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-notes',
  'voice-notes',
  false,
  5242880,
  array['audio/mp4', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/mpeg']
)
on conflict (id) do nothing;

-- 5) Storage policies, mirroring chat-images (0021 write/update, 0031 read,
-- 0050 delete). Path shape: voice-notes/{cluster_id}/{file}.
create policy voice_notes_member_write
  on storage.objects for insert
  with check (
    bucket_id = 'voice-notes'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );

create policy voice_notes_member_update
  on storage.objects for update
  using (
    bucket_id = 'voice-notes'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );

create policy voice_notes_member_read
  on storage.objects for select
  using (
    bucket_id = 'voice-notes'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );

create policy voice_notes_member_delete
  on storage.objects for delete
  using (
    bucket_id = 'voice-notes'
    and public.is_active_member(split_part(name, '/', 1)::uuid)
  );

-- 6) send_message: accept audio params with defaults so older clients keep
-- working. Exactly one content kind required; audio requires a valid
-- duration, an allowlisted MIME, a cluster-scoped path, and no caption.
-- NOTE: the pre-voice 4-arg overload is dropped below. Postgres CREATE OR
-- REPLACE only replaces an identical signature, so without the drop the old
-- overload would survive alongside this one and PostgREST would fail every
-- 4-key call as ambiguous (PGRST203).
create or replace function public.send_message(
  p_cluster_id uuid,
  p_content text default null,
  p_image_url text default null,
  p_reply_to_id uuid default null,
  p_audio_url text default null,
  p_audio_duration_sec integer default null,
  p_audio_waveform jsonb default null,
  p_audio_mime text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_msg_id uuid;
  v_mentions uuid[];
  v_broadcast boolean := false;
  v_author_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  if not (public.is_active_member(p_cluster_id) and public.cluster_unlocked(p_cluster_id)) then
    raise exception 'chat_locked';
  end if;
  if p_content is null and p_image_url is null and p_audio_url is null then
    raise exception 'empty_message';
  end if;
  if p_image_url is not null and p_audio_url is not null then
    raise exception 'single_media_only';
  end if;
  if p_audio_url is not null then
    if p_audio_duration_sec is null or p_audio_duration_sec < 1 or p_audio_duration_sec > 120 then
      raise exception 'audio_duration_out_of_range';
    end if;
    if p_audio_mime is null or p_audio_mime not in
      ('audio/mp4', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/mpeg') then
      raise exception 'audio_mime_unsupported';
    end if;
    if p_audio_waveform is not null
      and (jsonb_typeof(p_audio_waveform) <> 'array' or jsonb_array_length(p_audio_waveform) > 64) then
      raise exception 'audio_waveform_invalid';
    end if;
    if p_content is not null then
      raise exception 'audio_caption_not_supported';
    end if;
    if p_audio_url not like (p_cluster_id::text || '/%') then
      raise exception 'audio_path_invalid';
    end if;
  end if;

  if p_reply_to_id is not null and not exists (
    select 1 from public.messages
    where id = p_reply_to_id
      and cluster_id = p_cluster_id
      and deleted_at is null
  ) then
    raise exception 'invalid_reply_target';
  end if;

  perform public.check_rate_limit('send_message', 60, interval '1 hour');

  insert into public.messages
    (cluster_id, author_id, content, image_url, reply_to_id, audio_url, audio_duration_sec, audio_waveform, audio_mime)
  values
    (p_cluster_id, auth.uid(), p_content, p_image_url, p_reply_to_id,
     p_audio_url, p_audio_duration_sec, p_audio_waveform, p_audio_mime)
  returning id into v_msg_id;

  if p_content is not null then
    v_broadcast := public.is_mentioned_everyone(p_content);

    if v_broadcast then
      select array_agg(distinct cm.user_id) into v_mentions
      from public.cluster_members cm
      where cm.cluster_id = p_cluster_id
        and cm.left_at is null
        and cm.user_id <> auth.uid();
    else
      select array_agg(distinct m.id) into v_mentions
      from public.cluster_members cm
      join public.profiles m on m.id = cm.user_id
      where cm.cluster_id = p_cluster_id
        and cm.left_at is null
        and m.id <> auth.uid()
        and public.is_mentioned(p_content, m.display_name);
    end if;

    if v_mentions is not null then
      select display_name into v_author_name
      from public.profiles
      where id = auth.uid();

      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select u, 'mention', p_cluster_id,
             v_author_name || case when v_broadcast then ' mentioned everyone' else ' mentioned you' end,
             null,
             jsonb_build_object('message_id', v_msg_id)
      from unnest(v_mentions) as u
      where not exists (
        select 1 from public.user_mutes m
        where m.user_id = u and m.muted_user_id = auth.uid()
      );
    end if;
  end if;

  return v_msg_id;
end; $$;

drop function if exists public.send_message(uuid, text, text, uuid);

-- 7) Plain-chat push preview: voice notes show "Voice note (M:SS)" instead
-- of leaking content. Mention recipients keep their mention push; everyone
-- else gets this preview on the messages channel. Mute, prefs, and account
-- gates are unchanged from 0170.
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
    and public.is_account_active_internal(cm.user_id);

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

-- 8) delete_message removes the voice object server-side. The soft-deleted
-- row is hidden from SELECT, so a client cache miss would orphan the file
-- permanently. Runs as the function owner (bypasses RLS like the 0054
-- storage reclaim, with the same allow_delete_query guard); return type
-- unchanged, so no caller changes.
create or replace function public.delete_message(p_message_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
  v_image text;
  v_audio text;
  v_deleted_at timestamptz;
begin
  select author_id, image_url, audio_url, deleted_at
  into v_author, v_image, v_audio, v_deleted_at
  from public.messages
  where id = p_message_id;

  if not found then raise exception 'message_not_found'; end if;
  if v_author is distinct from auth.uid() then raise exception 'not_author'; end if;
  if not public.is_account_active(auth.uid()) then raise exception 'account_inactive'; end if;

  if v_deleted_at is not null then
    return v_image;
  end if;

  update public.messages
  set deleted_at = now()
  where id = p_message_id
    and author_id = auth.uid()
    and deleted_at is null;

  if v_audio is not null then
    perform set_config('storage.allow_delete_query', 'true', true);

    delete from storage.objects
    where bucket_id = 'voice-notes'
      and name = v_audio;

    perform set_config('storage.allow_delete_query', 'false', true);
  end if;

  return v_image;
end; $$;

revoke all on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.delete_message(uuid) to service_role;

-- 9) Voice notes are not editable: reject content changes on audio rows.
-- delete_message (deleted_at) and moderation (moderation_status) updates are
-- unaffected since they leave content alone.
create or replace function public.reject_audio_content_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if OLD.audio_url is not null and NEW.content is distinct from OLD.content then
    raise exception 'audio_not_editable';
  end if;
  return NEW;
end; $$;

drop trigger if exists messages_no_audio_edit on public.messages;
create trigger messages_no_audio_edit
  before update on public.messages
  for each row execute function public.reject_audio_content_edit();

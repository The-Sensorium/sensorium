-- 0201_send_message_rate_limit_120.sql
-- Raise the chat send budget from 60 to 120 messages per hour per user.
-- 60/hr (1/min sustained) blocks lively but legitimate conversation in an
-- 8-person room; 120/hr matches the toggle budget scale while still stopping
-- runaway scripts and capping @everyone fan-out. Body is otherwise identical
-- to the live version in 0200 (voice-note signature and guards unchanged).
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

  perform public.check_rate_limit('send_message', 120, interval '1 hour');

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

-- 0163_mute_notification_suppression.sql
-- Muted-author notification suppression: once b mutes a, no new notification
-- traffic from a reaches b (no inbox rows, no push, no email) while history
-- stays untouched.
--
-- Scope: member activity only (mention incl. @everyone broadcasts, reaction,
-- post_comment, post_like) plus the plain-chat push path. Governance
-- (vote_started, vote_result, replacement), signal_new, invitation_received,
-- cluster_formed, queue_update, unlocked, and all staff/moderation types are
-- unchanged: muting a member never hides a vote about them or a moderator
-- notice. Muting stays silent (no row tells anyone they were muted).
--
-- Email verification outcome: member-activity email keys off the same
-- notifications rows; no separate member-activity email trigger exists in the
-- migrations (outbound_emails is written only by explicit enqueue_email calls
-- in the moderation/appeals/staff lifecycle: 0068/0069/0070/0122/0124/0125).
-- Suppressing the inbox row therefore suppresses push (0100/0102/0103/0137/
-- 0145 chain) and any row-keyed email together. Plain-chat pushes bypass the
-- inbox, so fan_out_push_for_message gets its own explicit guard.
--
-- History: rows created before the mute stay visible; unmuting restores future
-- delivery only (nothing was stored to resurrect). No schema change, no RLS
-- change, no new notification type, no frontend change.

-- -- 1) send_message: live body is 0155 ----------------------------------------
-- Only the mention INSERT changes: recipients who muted the sender are
-- excluded. Covers direct @mentions and the @everyone broadcast identically
-- (single INSERT SELECT). Note: there is no `message`-row branch to guard;
-- since 0038 send_message writes mention rows only (plain chat is synthesized
-- at read time, pushed via fan_out_push_for_message below).
create or replace function public.send_message(
  p_cluster_id uuid,
  p_content text default null,
  p_image_url text default null,
  p_reply_to_id uuid default null
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
  if p_content is null and p_image_url is null then raise exception 'empty_message'; end if;

  if p_reply_to_id is not null and not exists (
    select 1 from public.messages
    where id = p_reply_to_id
      and cluster_id = p_cluster_id
      and deleted_at is null
  ) then
    raise exception 'invalid_reply_target';
  end if;

  perform public.check_rate_limit('send_message', 60, interval '1 hour');

  insert into public.messages (cluster_id, author_id, content, image_url, reply_to_id)
  values (p_cluster_id, auth.uid(), p_content, p_image_url, p_reply_to_id)
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

-- -- 2) fn_notify_reaction: live body is 0024 ----------------------------------
create or replace function public.fn_notify_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_cluster uuid;
begin
  select m.author_id, m.cluster_id into v_author, v_cluster
  from public.messages m
  where m.id = new.message_id;

  if v_author is null or v_author = new.user_id then return new; end if;

  if exists (
    select 1 from public.user_mutes
    where user_id = v_author and muted_user_id = NEW.user_id
  ) then return NEW; end if;

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  values (
    v_author,
    'reaction',
    v_cluster,
    (select display_name from public.profiles where id = new.user_id) || ' reacted to your message',
    new.emoji,
    jsonb_build_object('message_id', new.message_id, 'emoji', new.emoji)
  );

  return new;
end; $$;

-- -- 3) create_post_comment: live body is 0162 ---------------------------------
create or replace function public.create_post_comment(
  p_post_id uuid,
  p_content text default null,
  p_image_url text default null,
  p_gif_url text default null,
  p_parent_comment_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_author uuid;
  v_parent_author uuid;
  v_actor uuid := auth.uid();
  v_body text;
  v_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select cluster_id, author_id into v_cluster, v_author
  from public.posts where id = p_post_id and deleted_at is null;
  if v_cluster is null then raise exception 'post_not_found'; end if;
  if not (public.is_active_member(v_cluster) and public.cluster_unlocked(v_cluster)) then
    raise exception 'posts_locked';
  end if;
  if p_content is null and p_image_url is null and p_gif_url is null then
    raise exception 'empty_comment';
  end if;
  if p_content is not null and (char_length(p_content) < 1 or char_length(p_content) > 1000) then
    raise exception 'content_out_of_range';
  end if;
  if p_image_url is not null and p_gif_url is not null then
    raise exception 'single_media_only';
  end if;
  if p_parent_comment_id is not null and not exists (
    select 1 from public.post_comments
    where id = p_parent_comment_id
      and post_id = p_post_id
      and deleted_at is null
  ) then
    raise exception 'invalid_reply_target';
  end if;

  insert into public.post_comments (post_id, author_id, content, image_url, gif_url, parent_comment_id, cluster_id)
  values (p_post_id, v_actor, p_content, p_image_url, p_gif_url, p_parent_comment_id, v_cluster)
  returning id into v_id;

  insert into public.comment_likes (comment_id, user_id, cluster_id)
  values (v_id, v_actor, v_cluster)
  on conflict do nothing;

  v_body := case
    when p_content is not null and char_length(p_content) > 0 then left(p_content, 100)
    when p_gif_url is not null then '[GIF]'
    when p_image_url is not null then '[Photo]'
    else null
  end;

  if v_author is not null and v_author <> v_actor
    and not exists (
      select 1 from public.user_mutes m
      where m.user_id = v_author and m.muted_user_id = v_actor
    ) then
    insert into public.notifications (user_id, type, cluster_id, title, body, payload)
    values (v_author, 'post_comment', v_cluster,
            (select display_name from public.profiles where id = v_actor) || ' replied to your post',
            v_body, jsonb_build_object('post_id', p_post_id, 'comment_id', v_id));
  end if;

  if p_parent_comment_id is not null then
    select author_id into v_parent_author
    from public.post_comments where id = p_parent_comment_id;
    if v_parent_author is not null and v_parent_author <> v_actor and v_parent_author is distinct from v_author
      and not exists (
        select 1 from public.user_mutes m
        where m.user_id = v_parent_author and m.muted_user_id = v_actor
      ) then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      values (v_parent_author, 'post_comment', v_cluster,
              (select display_name from public.profiles where id = v_actor) || ' replied to your comment',
              v_body, jsonb_build_object('post_id', p_post_id, 'comment_id', v_id));
    end if;
  end if;

  return v_id;
end; $$;

-- -- 4) toggle_post_like: live body is 0139 ------------------------------------
create or replace function public.toggle_post_like(p_post_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_author uuid;
  v_member uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select cluster_id, author_id into v_cluster, v_author
  from public.posts where id = p_post_id;
  if v_cluster is null then raise exception 'post_not_found'; end if;
  if not (public.is_active_member(v_cluster) and public.cluster_unlocked(v_cluster)) then
    raise exception 'posts_locked';
  end if;

  perform public.check_rate_limit('toggle', 120, interval '1 hour');

  select user_id into v_member from public.post_likes
  where post_id = p_post_id and user_id = v_actor;
  if v_member is null then
    insert into public.post_likes (post_id, user_id, cluster_id)
    values (p_post_id, v_actor, v_cluster);

    if v_author is not null and v_author <> v_actor
      and not exists (
        select 1 from public.user_mutes m
        where m.user_id = v_author and m.muted_user_id = v_actor
      ) then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      values (v_author, 'post_like', v_cluster,
              (select display_name from public.profiles where id = v_actor) || ' liked your post',
              null, jsonb_build_object('post_id', p_post_id));
    end if;
  else
    delete from public.post_likes where post_id = p_post_id and user_id = v_actor;
  end if;
end; $$;

-- -- 5) fan_out_push_for_message: live body is 0155 ----------------------------
-- Plain chat bypasses the inbox, so muted recipients are skipped explicitly.
-- Mention/broadcast recipients get no plain push by construction (same as
-- 0155); their mention push dies with the suppressed mention row above.
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
    when NEW.content is null then '[Photo]'
    when NEW.content like 'gif:%' then '[GIF]'
    else left(NEW.content, 140)
  end;

  v_data := jsonb_strip_nulls(jsonb_build_object(
    'v', 1,
    'kind', 'message',
    'clusterId', NEW.cluster_id
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
    and public.is_account_active(cm.user_id);

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

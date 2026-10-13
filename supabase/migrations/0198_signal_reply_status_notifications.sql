-- 0198_signal_reply_status_notifications.sql
-- Targeted Signal follow-ups. Raising a Signal already fans out signal_new to
-- the whole cluster, but replies and status changes were silent unless the
-- member happened to be looking at the Signals tab.
--
-- Targeted scope (matches the posts pattern, avoids re-pinging the cluster):
--   - reply_signal notifies the signal author (not the actor).
--   - set_signal_status notifies distinct repliers (not the actor). Only the
--     raiser can change status, so this reaches the helpers without noise.
-- Both types ride the existing prefs.signals toggle, the notifications INSERT
-- realtime publication, and the push fan-out (signalId already flows through).
-- Muting does not suppress these, same as signal_new.

-- -- notification_allowed (live body is 0181, plus the signal trio) ------------
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
    when p_type in ('meetup_invite', 'meetup_confirmed', 'meetup_reminder_24h', 'meetup_reminder_15m', 'meetup_starting') then p_pref.meetups
    when p_type = 'invitation_received' then p_pref.invitations
    when p_type in ('signal_new', 'signal_reply', 'signal_status') then p_pref.signals
    when p_type = 'post_comment' then p_pref.post_comment
    when p_type = 'post_like' then p_pref.post_like
    when p_type = 'moderation_notice' then true
    else true
  end;
$$;

-- -- reply_signal (live body is 0139, plus 0054 guards + author notify) --------
create or replace function public.reply_signal(p_signal_id uuid, p_content text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_author uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select cluster_id, author_id into v_cluster, v_author
  from public.signals where id = p_signal_id;
  if v_cluster is null then raise exception 'signal_not_found'; end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = v_cluster and user_id = v_actor and left_at is null
  ) then raise exception 'not_a_member'; end if;

  insert into public.signal_replies (signal_id, author_id, content, cluster_id)
  values (p_signal_id, v_actor, p_content, v_cluster);

  if v_author is not null and v_author <> v_actor then
    insert into public.notifications (user_id, type, cluster_id, title, body, payload)
    values (v_author, 'signal_reply', v_cluster,
            (select display_name from public.profiles where id = v_actor) || ' replied to your Signal',
            left(p_content, 140),
            jsonb_build_object('signal_id', p_signal_id));
  end if;
end; $$;

-- -- set_signal_status (live body is 0054, plus replier notify) ----------------
create or replace function public.set_signal_status(p_signal_id uuid, p_status signal_status) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_actor uuid := auth.uid();
  v_updated integer;
  v_title text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select cluster_id into v_cluster from public.signals where id = p_signal_id;

  update public.signals
  set status = p_status,
      resolved_at = case when p_status = 'resolved' then now() else null end,
      resolved_by = case when p_status = 'resolved' then v_actor else null end
  where id = p_signal_id and author_id = v_actor and status <> p_status;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return; end if;

  v_title := (select display_name from public.profiles where id = v_actor) ||
    case p_status
      when 'resolved' then ' marked their Signal resolved'
      when 'in_progress' then ' marked their Signal in progress'
      else ' reopened their Signal'
    end;

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select distinct r.author_id, 'signal_status'::public.notification_type, v_cluster, v_title, null,
         jsonb_build_object('signal_id', p_signal_id)
  from public.signal_replies r
  where r.signal_id = p_signal_id
    and r.author_id <> v_actor;
end; $$;

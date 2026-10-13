-- 0199_signal_reply_mentions.sql
-- Mentions in signal replies. A reply can @-mention cluster members using the
-- same word-boundary rule as chat (`is_mentioned`, plus the `@everyone`
-- broadcast from 0155). Mentioned members get a `mention` notification that
-- deep-links to the signal thread (payload carries `signal_id`), so all of
-- the existing mention semantics ride along: the per-cluster `mentions` pref
-- toggle, push/email fan-out, and the 0163 muted-author suppression.
--
-- The `signal_reply` author notify (0198) is skipped when the author was
-- already mentioned, so nobody gets two rows for one reply (mirrors how
-- send_message excludes mentioned members from the plain `message` fan-out).
-- A mentioned author who muted the replier gets nothing, same as chat.
-- No new enum values; reuses `mention`.

-- -- reply_signal (live body is 0198, plus mention fan-out) -------------------
create or replace function public.reply_signal(p_signal_id uuid, p_content text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_author uuid;
  v_actor uuid := auth.uid();
  v_mentions uuid[];
  v_broadcast boolean := false;
  v_author_name text;
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

  if p_content is not null then
    v_broadcast := public.is_mentioned_everyone(p_content);

    if v_broadcast then
      select array_agg(distinct cm.user_id) into v_mentions
      from public.cluster_members cm
      where cm.cluster_id = v_cluster
        and cm.left_at is null
        and cm.user_id <> v_actor;
    else
      select array_agg(distinct m.id) into v_mentions
      from public.cluster_members cm
      join public.profiles m on m.id = cm.user_id
      where cm.cluster_id = v_cluster
        and cm.left_at is null
        and m.id <> v_actor
        and public.is_mentioned(p_content, m.display_name);
    end if;

    if v_mentions is not null then
      select display_name into v_author_name
      from public.profiles
      where id = v_actor;

      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select u, 'mention', v_cluster,
             v_author_name || case when v_broadcast then ' mentioned everyone' else ' mentioned you' end,
             null,
             jsonb_build_object('signal_id', p_signal_id)
      from unnest(v_mentions) as u
      where not exists (
        select 1 from public.user_mutes m
        where m.user_id = u and m.muted_user_id = v_actor
      );
    end if;
  end if;

  if v_author is not null and v_author <> v_actor
     and (v_mentions is null or not (v_author = any(v_mentions))) then
    insert into public.notifications (user_id, type, cluster_id, title, body, payload)
    values (v_author, 'signal_reply', v_cluster,
            (select display_name from public.profiles where id = v_actor) || ' replied to your Signal',
            left(p_content, 140),
            jsonb_build_object('signal_id', p_signal_id));
  end if;
end; $$;

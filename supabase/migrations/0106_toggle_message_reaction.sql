-- 0106_toggle_message_reaction.sql
-- Atomic INSERT-or-DELETE toggle for chat message reactions. The room's
-- useToggleReaction patches the reactions cache optimistically, so the server
-- write must be race-free: the old read-then-write (SELECT, then INSERT or
-- DELETE) could double-write on a fast double-tap while the first write was
-- still in flight. This mirrors toggle_post_like (0073) / toggle_comment_like
-- (0082): security definer, active-membership + unlocked-cluster guard, single
-- statement pair on the (message_id, user_id, emoji) primary key. Follows 0105.

create or replace function public.toggle_message_reaction(p_message_id uuid, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_member uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if p_emoji is null or char_length(p_emoji) < 1 then raise exception 'emoji_required'; end if;

  select cluster_id into v_cluster from public.messages where id = p_message_id;
  if v_cluster is null then raise exception 'message_not_found'; end if;
  if not (public.is_active_member(v_cluster) and public.cluster_unlocked(v_cluster)) then
    raise exception 'reactions_locked';
  end if;

  select user_id into v_member from public.message_reactions
  where message_id = p_message_id and user_id = v_actor and emoji = p_emoji;
  if v_member is null then
    insert into public.message_reactions (message_id, user_id, emoji)
    values (p_message_id, v_actor, p_emoji);
  else
    delete from public.message_reactions
    where message_id = p_message_id and user_id = v_actor and emoji = p_emoji;
  end if;
end; $$;

grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;
grant execute on function public.toggle_message_reaction(uuid, text) to service_role;

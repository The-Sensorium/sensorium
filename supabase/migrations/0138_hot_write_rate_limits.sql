-- 0138_hot_write_rate_limits.sql
-- Abuse prevention for hot writes. 0126 only limited reports/appeals (via
-- unindexed count(*) scans); join_queue, send_message, vote_on, vote creation,
-- reaction/like toggles, and call-token mints were free to script (queue churn
-- triggers maybe_form_cluster lock contention, vote creation fans out 8
-- notifications per call, token farming burns LiveKit budget).
--
--   1. rate_limit_events event log + check_rate_limit_for/check_rate_limit:
--      permissive per-action hourly budgets (20 queue joins, 60 messages,
--      10 votes, 120 toggles per hour; 10 call mints per 10 minutes). Each
--      check prunes the caller's expired rows for that action first, so the
--      table holds roughly one window of activity, and the count is an
--      index-only scan over at most `limit` rows. Normal use never reaches
--      these; scripts get 'rate_limited', which the client maps to friendly
--      copy (src/lib/error.ts).
--   2. The same checks wired into join_queue (0129 body), send_message (0054),
--      vote_on / start_replace_vote / start_name_vote (0054),
--      toggle_message_reaction (0106), toggle_post_like (0080),
--      toggle_comment_like (0082) — placed after validation guards so failed
--      calls don't consume budget, before the write so no-op re-joins still
--      count against churn.
--   3. 0126 report/appeal checks rewritten from count(*) to EXISTS + OFFSET
--      (true once the N+1th row exists, no full scan) with matching indexes.
--   4. get_call_token_context(p_call_id, p_user_id): single-round-trip,
--      service-role-only context read for the create-call-token Edge Function
--      (replaces 1 RPC + 4 REST calls), including the call-token rate check.
--      Granted to service_role only: it takes an arbitrary user id.

-- -- 1) Event log + check helpers ------------------------------------------------

create table public.rate_limit_events (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_user_action_idx
  on public.rate_limit_events (user_id, action, created_at desc);

alter table public.rate_limit_events enable row level security;

revoke all on table public.rate_limit_events from anon, authenticated;
grant select, insert, update, delete on public.rate_limit_events to service_role;

create function public.check_rate_limit_for(
  p_user_id uuid,
  p_action text,
  p_limit int,
  p_window interval
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then raise exception 'not_authenticated'; end if;

  delete from public.rate_limit_events
  where user_id = p_user_id
    and action = p_action
    and created_at < now() - p_window;

  if exists (
    select 1 from public.rate_limit_events
    where user_id = p_user_id
      and action = p_action
      and created_at > now() - p_window
    offset greatest(p_limit - 1, 0)
  ) then
    raise exception 'rate_limited';
  end if;

  begin
    insert into public.rate_limit_events (user_id, action)
    values (p_user_id, p_action);
  exception when foreign_key_violation then
    -- No profile (yet): nothing to budget against. The caller's own guards
    -- (membership, active account) still apply downstream.
    null;
  end;
end; $$;

create function public.check_rate_limit(
  p_action text,
  p_limit int,
  p_window interval
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.check_rate_limit_for(auth.uid(), p_action, p_limit, p_window);
end; $$;

revoke execute on function
  public.check_rate_limit(text, integer, interval),
  public.check_rate_limit_for(uuid, text, integer, interval)
  from public, anon, authenticated;

-- -- 2) Hot-write gates (bodies otherwise identical to live versions) -----------

-- join_queue: live body is 0129.
create or replace function public.join_queue(p_mode matching_mode, p_radius_km int default null)
returns table (queue_key text, waiting int)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_radius int;
  v_key text;
  v_count int;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  perform public.assert_account_can_write();

  select * into v_profile from public.profiles where id = v_user_id;
  if v_profile.dob is null then raise exception 'complete onboarding first'; end if;

  if exists (
    select 1 from public.mode_cooldowns
    where user_id = v_user_id and mode = p_mode and available_at > now()
  ) then raise exception 'cooldown_active'; end if;

  if exists (
    select 1 from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    where cm.user_id = v_user_id and cm.left_at is null and c.matching_mode = p_mode
  ) then raise exception 'already_in_cluster_of_mode'; end if;

  perform public.check_rate_limit('join_queue', 20, interval '1 hour');

  if p_mode = 'local' then
    v_radius := coalesce(v_profile.local_radius_km, p_radius_km);
    if v_profile.latitude is null or v_profile.local_area is null or v_radius is null then
      raise exception 'location_not_set';
    end if;
    if v_profile.local_radius_km is null then
      update public.profiles set local_radius_km = v_radius where id = v_user_id;
    end if;
    delete from public.queue_entries
    where user_id = v_user_id and mode = 'local';
  else
    v_radius := p_radius_km;
  end if;

  v_key := public.fn_queue_key(p_mode, v_profile.dob, v_profile.country_code, v_profile.local_area, v_radius);

  insert into public.queue_entries (user_id, mode, queue_key)
  values (v_user_id, p_mode, v_key)
  on conflict on constraint one_queue_per_mode do nothing;

  select count(*) into v_count
  from public.queue_entries q where q.mode = p_mode and q.queue_key = v_key;

  return query select v_key, v_count;
end; $$;

-- send_message: live body is 0054 (auth/account guards + 4-arg signature).
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
    select array_agg(distinct m.id) into v_mentions
    from public.cluster_members cm
    join public.profiles m on m.id = cm.user_id
    where cm.cluster_id = p_cluster_id
      and cm.left_at is null
      and m.id <> auth.uid()
      and public.is_mentioned(p_content, m.display_name);

    if v_mentions is not null then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      select u, 'mention', p_cluster_id,
             (select display_name from public.profiles where id = auth.uid()) || ' mentioned you',
             null,
             jsonb_build_object('message_id', v_msg_id)
      from unnest(v_mentions) as u;
    end if;
  end if;

  return v_msg_id;
end; $$;

-- vote_on / start_replace_vote / start_name_vote: live bodies are 0054
-- (auth/account guards + choice validation).
create or replace function public.vote_on(p_vote_id uuid, p_choice text) returns void
language plpgsql security definer set search_path = public as $$
declare v_type vote_type;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select v.type into v_type
  from public.votes v
  join public.cluster_members cm on cm.cluster_id = v.cluster_id
  where v.id = p_vote_id and cm.user_id = auth.uid() and cm.left_at is null and v.status = 'open';

  if v_type is null then raise exception 'vote_not_available'; end if;

  if v_type in ('replace_member', 'change_name') then
    if p_choice not in ('yes', 'no') then raise exception 'invalid_choice'; end if;
  elsif v_type = 'select_candidate' then
    if not exists (
      select 1
      from public.replacement_rounds r
      cross join lateral unnest(coalesce(r.candidate_pool, '{}')) as c(user_id)
      where r.select_candidate_vote_id = p_vote_id
        and c.user_id::text = p_choice
    ) then raise exception 'invalid_choice'; end if;
  end if;

  perform public.check_rate_limit('vote', 10, interval '1 hour');

  insert into public.vote_responses (vote_id, user_id, choice)
  values (p_vote_id, auth.uid(), p_choice)
  on conflict (vote_id, user_id) do update set choice = excluded.choice, created_at = now();
end; $$;

create or replace function public.start_replace_vote(p_cluster_id uuid, p_target_member_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if not public.is_active_member(p_cluster_id) then raise exception 'not_a_member'; end if;
  if p_target_member_id = auth.uid() then raise exception 'cannot_vote_self'; end if;
  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and user_id = p_target_member_id and left_at is null
  ) then raise exception 'target_not_member'; end if;

  perform public.check_rate_limit('vote', 10, interval '1 hour');

  insert into public.votes (cluster_id, type, initiated_by, target_member_id)
  values (p_cluster_id, 'replace_member', auth.uid(), p_target_member_id)
  returning id into v_id;

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select user_id, 'vote_started', p_cluster_id, 'A replacement vote has started', null
  from public.cluster_members
  where cluster_id = p_cluster_id and left_at is null;

  return v_id;
end; $$;

create or replace function public.start_name_vote(p_cluster_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if not public.is_active_member(p_cluster_id) then raise exception 'not_a_member'; end if;

  perform public.check_rate_limit('vote', 10, interval '1 hour');

  insert into public.votes (cluster_id, type, initiated_by, name_suggestion)
  values (p_cluster_id, 'change_name', auth.uid(), p_name)
  returning id into v_id;

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select user_id, 'vote_started', p_cluster_id,
         'A cluster name change has been proposed', p_name
  from public.cluster_members
  where cluster_id = p_cluster_id and left_at is null;

  return v_id;
end; $$;

-- toggle_message_reaction: live body is 0106.
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

  perform public.check_rate_limit('toggle', 120, interval '1 hour');

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

-- toggle_post_like: live body is 0080 §4.
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
    insert into public.post_likes (post_id, user_id) values (p_post_id, v_actor);

    if v_author is not null and v_author <> v_actor then
      insert into public.notifications (user_id, type, cluster_id, title, body, payload)
      values (v_author, 'post_like', v_cluster,
              (select display_name from public.profiles where id = v_actor) || ' liked your post',
              null, jsonb_build_object('post_id', p_post_id));
    end if;
  else
    delete from public.post_likes where post_id = p_post_id and user_id = v_actor;
  end if;
end; $$;

-- toggle_comment_like: live body is 0082.
create or replace function public.toggle_comment_like(p_comment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_member uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select p.cluster_id into v_cluster
  from public.post_comments pc
  join public.posts p on p.id = pc.post_id
  where pc.id = p_comment_id and pc.deleted_at is null;
  if v_cluster is null then raise exception 'comment_not_found'; end if;
  if not (public.is_active_member(v_cluster) and public.cluster_unlocked(v_cluster)) then
    raise exception 'comments_locked';
  end if;

  perform public.check_rate_limit('toggle', 120, interval '1 hour');

  select user_id into v_member from public.comment_likes
  where comment_id = p_comment_id and user_id = v_actor;
  if v_member is null then
    insert into public.comment_likes (comment_id, user_id) values (p_comment_id, v_actor);
  else
    delete from public.comment_likes where comment_id = p_comment_id and user_id = v_actor;
  end if;
end; $$;

-- -- 3) Report/appeal checks: EXISTS + OFFSET instead of count(*) ---------------

create index reports_reporter_created_idx
  on public.reports (reporter_id, created_at desc);

create index appeals_user_created_idx
  on public.appeals (user_id, created_at desc);

create or replace function public.check_report_rate_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.reporter_id is null then
    return NEW;
  end if;
  if exists (
    select 1 from public.reports
    where reporter_id = NEW.reporter_id
      and created_at > now() - interval '1 hour'
    offset 9
  ) then
    raise exception 'report_rate_limited';
  end if;
  return NEW;
end; $$;

create or replace function public.check_appeal_rate_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.user_id is null then
    return NEW;
  end if;
  if exists (
    select 1 from public.appeals
    where user_id = NEW.user_id
      and created_at > now() - interval '24 hours'
    offset 2
  ) then
    raise exception 'appeal_rate_limited';
  end if;
  return NEW;
end; $$;

-- -- 4) Call-token context: one round-trip for the Edge Function -----------------
-- Returns everything create-call-token needs (membership, participation,
-- account/cluster/call state, display name) plus the mint rate check, so the
-- function makes ONE rpc instead of 1 rpc + 4 REST calls. Service-role only:
-- it takes an arbitrary user id and must never be callable as the user.

create function public.get_call_token_context(p_call_id uuid, p_user_id uuid)
returns table (
  call_found boolean,
  call_status text,
  call_expires_at timestamptz,
  cluster_id uuid,
  cluster_status text,
  is_active boolean,
  is_member boolean,
  is_participant boolean,
  display_name text
)
language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then raise exception 'not_authenticated'; end if;

  perform public.check_rate_limit_for(p_user_id, 'call_token', 10, interval '10 minutes');

  return query
  select
    c.id is not null,
    c.status,
    c.expires_at,
    c.cluster_id,
    cl.status::text,
    public.is_account_active(p_user_id),
    exists (
      select 1 from public.cluster_members cm
      where cm.cluster_id = c.cluster_id
        and cm.user_id = p_user_id
        and cm.left_at is null
    ),
    exists (
      select 1 from public.call_participants cp
      where cp.call_id = p_call_id
        and cp.user_id = p_user_id
        and cp.left_at is null
    ),
    (select pr.display_name from public.profiles pr where pr.id = p_user_id)
  from (select 1) as one
  left join public.calls c on c.id = p_call_id
  left join public.clusters cl on cl.id = c.cluster_id;
end; $$;

revoke execute on function
  public.get_call_token_context(uuid, uuid)
  from public, anon, authenticated;

grant execute on function
  public.get_call_token_context(uuid, uuid)
  to service_role;

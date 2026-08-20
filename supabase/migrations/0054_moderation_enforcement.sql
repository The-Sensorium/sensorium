-- 0054_moderation_enforcement.sql
-- Phase 3 of the role-based access plan: content + account enforcement.
--
--   1. Harden message reads/writes: members only ever see live, approved
--      content; the author update grant is narrowed to (content, edited_at,
--      deleted_at) so moderation columns are not client-writable.
--   2. Add `assert_account_can_write()` to every member mutation function and
--      add `is_account_active()` to member write policies, so suspensions and
--      bans are enforced against direct Supabase calls, not just the UI.
--   3. Add moderator content actions (hide_message / restore_message) that only
--      touch moderation-owned columns and write an audit row.
--   4. Add the transaction-safe restriction RPC (suspension / ban / lift) with
--      moderator limits, staff self-protection, last-admin protection, and ban
--      role revocation + cluster departure + replacement startup.
--   5. Rewrite delete_my_account to reclaim storage server-side (status-blind),
--      stamp revoked role history, and protect the last active admin.
--
-- Follows 0053. Idempotent via db reset.

-- -- 1) Message read/write hardening -----------------------------------------

drop policy "messages read unlocked cluster" on public.messages;
create policy "messages read unlocked cluster"
  on public.messages for select
  using (
    public.is_active_member(cluster_id)
    and public.cluster_unlocked(cluster_id)
    and deleted_at is null
    and moderation_status = 'approved'
  );

drop policy "messages insert unlocked cluster" on public.messages;
create policy "messages insert unlocked cluster"
  on public.messages for insert
  with check (
    public.is_active_member(cluster_id)
    and public.cluster_unlocked(cluster_id)
    and auth.uid() = author_id
    and public.is_account_active(auth.uid())
  );

drop policy "messages author update" on public.messages;
create policy "messages author update"
  on public.messages for update
  using (auth.uid() = author_id and public.is_account_active(auth.uid()))
  with check (auth.uid() = author_id and public.is_account_active(auth.uid()));

-- Narrow the author write grant to content/edited_at/deleted_at only. The
-- moderation_status column (and anything else) is not reachable through REST.
revoke update on public.messages from authenticated;
grant update (content, edited_at, deleted_at) on public.messages to authenticated;

-- Reactions and signal replies are direct-table writes: membership alone must
-- not let a suspended/banned user keep acting.

drop policy "reactions insert member" on public.message_reactions;
create policy "reactions insert member"
  on public.message_reactions for insert
  with check (
    auth.uid() = user_id
    and public.is_account_active(auth.uid())
    and public.is_active_member(
      (select cluster_id from public.messages where id = message_id)
    )
  );

drop policy "reactions delete own member" on public.message_reactions;
create policy "reactions delete own member"
  on public.message_reactions for delete
  using (
    auth.uid() = user_id
    and public.is_account_active(auth.uid())
    and public.is_active_member(
      (select cluster_id from public.messages where id = message_id)
    )
  );

drop policy "signal replies insert own cluster" on public.signal_replies;
create policy "signal replies insert own cluster"
  on public.signal_replies for insert
  with check (
    auth.uid() = author_id
    and public.is_account_active(auth.uid())
    and public.is_active_member(
      (select cluster_id from public.signals where id = signal_id)
    )
  );

drop policy "queue self insert" on public.queue_entries;
create policy "queue self insert"
  on public.queue_entries for insert
  with check (auth.uid() = user_id and public.is_account_active(auth.uid()));

drop policy "queue self delete" on public.queue_entries;
create policy "queue self delete"
  on public.queue_entries for delete
  using (auth.uid() = user_id and public.is_account_active(auth.uid()));

drop policy "vote responses insert" on public.vote_responses;
create policy "vote responses insert"
  on public.vote_responses for insert
  with check (
    public.is_account_active(auth.uid())
    and public.is_active_member((select cluster_id from public.votes where id = vote_id))
  );

drop policy "vote responses delete own" on public.vote_responses;
create policy "vote responses delete own"
  on public.vote_responses for delete
  using (auth.uid() = user_id and public.is_account_active(auth.uid()));

-- Profile self-update stays available, but not for suspended/banned accounts.
drop policy "profiles self update" on public.profiles;
create policy "profiles self update"
  on public.profiles for update
  using (auth.uid() = id and public.is_account_active(auth.uid()));

drop policy "prefs self" on public.notification_prefs;
create policy "prefs self"
  on public.notification_prefs for all
  using (auth.uid() = user_id and public.is_account_active(auth.uid()))
  with check (auth.uid() = user_id and public.is_account_active(auth.uid()));

-- -- 2) Account-status guard in every member mutation -------------------------

create or replace function public.join_queue(p_mode matching_mode, p_radius_km int default null)
returns table (queue_key text, waiting int)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
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

  if p_mode = 'local' then
    if v_profile.latitude is null or v_profile.local_area is null or p_radius_km is null then
      raise exception 'location_not_set';
    end if;
    delete from public.queue_entries
    where user_id = v_user_id and mode = 'local';
  end if;

  v_key := public.fn_queue_key(p_mode, v_profile.dob, v_profile.country_code, v_profile.local_area, p_radius_km);

  insert into public.queue_entries (user_id, mode, queue_key)
  values (v_user_id, p_mode, v_key)
  on conflict on constraint one_queue_per_mode do nothing;

  select count(*) into v_count
  from public.queue_entries q where q.mode = p_mode and q.queue_key = v_key;

  return query select v_key, v_count;
end; $$;

create or replace function public.leave_queue(p_mode matching_mode) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  delete from public.queue_entries
  where user_id = auth.uid() and mode = p_mode;
end; $$;

create or replace function public.submit_intro_answers(p_cluster_id uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_question jsonb;
  v_done int;
  v_completed int;
  v_total int;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and user_id = v_user_id and left_at is null
  ) then raise exception 'not_a_member'; end if;

  for v_question in select * from jsonb_array_elements(p_answers) loop
    insert into public.intro_answers (user_id, cluster_id, question_id, answer)
    values (v_user_id, p_cluster_id, (v_question->>'question_id')::int, v_question->>'answer')
    on conflict (user_id, cluster_id, question_id)
    do update set answer = excluded.answer, created_at = now();
  end loop;

  select count(*) into v_done from public.intro_answers
  where user_id = v_user_id and cluster_id = p_cluster_id;
  if v_done < 5 then return; end if;

  update public.cluster_members
  set intro_completed_at = now()
  where cluster_id = p_cluster_id and user_id = v_user_id;

  if exists (
    select 1 from public.clusters
    where id = p_cluster_id and status = 'introductions'
  ) then
    select count(*) into v_completed from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and intro_completed_at is not null;

    select count(*) into v_total from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null;

    if v_completed >= v_total then
      update public.clusters
      set introductions_completed_at = now(), status = 'active', updated_at = now()
      where id = p_cluster_id;

      insert into public.notifications (user_id, type, cluster_id, title, body)
      select user_id, 'unlocked', p_cluster_id, 'Your cluster is open',
             'Introductions are complete. Chat is now unlocked.'
      from public.cluster_members where cluster_id = p_cluster_id and left_at is null;
    end if;
  end if;
end; $$;

create or replace function public.raise_signal(p_cluster_id uuid, p_prompt text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and user_id = auth.uid() and left_at is null
  ) then raise exception 'not_a_member'; end if;

  insert into public.signals (cluster_id, author_id, prompt)
  values (p_cluster_id, auth.uid(), p_prompt) returning id into v_id;

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select user_id, 'signal_new', p_cluster_id,
         'A member raised a Signal',
         (select display_name from public.profiles where id = auth.uid()) || ' needs help',
         jsonb_build_object('signal_id', v_id)
  from public.cluster_members
  where cluster_id = p_cluster_id and left_at is null and user_id <> auth.uid();

  return v_id;
end; $$;

create or replace function public.reply_signal(p_signal_id uuid, p_content text) returns void
language plpgsql security definer set search_path = public as $$
declare v_cluster uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select cluster_id into v_cluster from public.signals where id = p_signal_id;
  if v_cluster is null then raise exception 'signal_not_found'; end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = v_cluster and user_id = auth.uid() and left_at is null
  ) then raise exception 'not_a_member'; end if;

  insert into public.signal_replies (signal_id, author_id, content)
  values (p_signal_id, auth.uid(), p_content);
end; $$;

create or replace function public.set_signal_status(p_signal_id uuid, p_status signal_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  update public.signals
  set status = p_status,
      resolved_at = case when p_status = 'resolved' then now() else null end,
      resolved_by = case when p_status = 'resolved' then auth.uid() else null end
  where id = p_signal_id and author_id = auth.uid();
end; $$;

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

  insert into public.vote_responses (vote_id, user_id, choice)
  values (p_vote_id, auth.uid(), p_choice)
  on conflict (vote_id, user_id) do update set choice = excluded.choice, created_at = now();
end; $$;

create or replace function public.leave_cluster(p_cluster_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mode matching_mode;
  v_leaver_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if not public.is_active_member(p_cluster_id) then raise exception 'not_a_member'; end if;

  select matching_mode into v_mode from public.clusters where id = p_cluster_id;

  select display_name into v_leaver_name
  from public.profiles where id = auth.uid();

  update public.cluster_members set left_at = now()
  where cluster_id = p_cluster_id and user_id = auth.uid();

  insert into public.mode_cooldowns (user_id, mode, available_at)
  values (auth.uid(), v_mode, now() + interval '30 days')
  on conflict (user_id, mode) do update set available_at = excluded.available_at;

  perform public.start_replacement(p_cluster_id);

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select cm.user_id, 'replacement', p_cluster_id,
         coalesce(v_leaver_name, 'A member') || ' left the cluster',
         'A spot just opened — we are finding a new member to fill it.'
  from public.cluster_members cm
  where cm.cluster_id = p_cluster_id and cm.left_at is null;
end; $$;

create or replace function public.accept_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv.user_id <> auth.uid() then raise exception 'not_yours'; end if;
  if v_inv.status <> 'pending' then raise exception 'already_responded'; end if;

  if exists (
    select 1 from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    where cm.user_id = auth.uid() and cm.left_at is null
      and c.matching_mode = (select matching_mode from public.clusters where id = v_inv.cluster_id)
  ) then raise exception 'already_in_cluster_of_mode'; end if;

  perform pg_advisory_xact_lock(hashtext('replacement:' || v_inv.cluster_id));

  update public.invitations set status = 'accepted', responded_at = now()
  where id = p_invitation_id;

  insert into public.cluster_members (cluster_id, user_id)
  values (v_inv.cluster_id, v_inv.user_id);

  delete from public.queue_entries where user_id = v_inv.user_id;

  update public.clusters
  set introductions_deadline = greatest(
        coalesce(introductions_deadline, now()),
        now() + interval '72 hours'
      )
  where id = v_inv.cluster_id and status = 'introductions';

  update public.replacement_rounds
  set status = 'filled', invited_user_id = v_inv.user_id, updated_at = now()
  where cluster_id = v_inv.cluster_id and status = 'inviting';

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select user_id, 'replacement', v_inv.cluster_id, 'A new member has joined', null
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null;
end; $$;

create or replace function public.decline_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select * into v_inv from public.invitations where id = p_invitation_id;
  if v_inv.user_id <> auth.uid() then raise exception 'not_yours'; end if;

  update public.invitations set status = 'declined', responded_at = now()
  where id = p_invitation_id and status = 'pending';

  perform public.advance_round_on_invitation_void(v_inv.cluster_id, v_inv.user_id);
end; $$;

-- Reports also require an active account (suspended users may not file).
create or replace function public.report_member(
  p_cluster_id uuid,
  p_target_user_id uuid,
  p_reason public.report_reason,
  p_details text default null,
  p_message_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reporter_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_reporter_id is null then
    raise exception 'not_authenticated';
  end if;

  perform public.assert_account_can_write();

  if v_reporter_id = p_target_user_id then
    raise exception 'cannot_report_self';
  end if;

  if p_details is not null and char_length(p_details) > 2000 then
    raise exception 'details_too_long';
  end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = v_reporter_id
  ) then
    raise exception 'not_a_member';
  end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = p_target_user_id
  ) then
    raise exception 'not_a_member';
  end if;

  if p_message_id is not null and not exists (
    select 1 from public.messages
    where id = p_message_id
      and cluster_id = p_cluster_id
      and author_id = p_target_user_id
      and deleted_at is null
  ) then
    raise exception 'message_not_reportable';
  end if;

  if exists (
    select 1 from public.reports
    where reporter_id = v_reporter_id
      and target_user_id = p_target_user_id
      and status in ('pending', 'reviewing')
  ) then
    raise exception 'duplicate_report';
  end if;

  insert into public.reports (
    cluster_id, reporter_id, target_user_id, reason, details, message_id
  )
  values (p_cluster_id, v_reporter_id, p_target_user_id, p_reason, p_details, p_message_id)
  returning id into v_report_id;

  return v_report_id;
end;
$$;

-- -- 3) Moderator content actions ---------------------------------------------

create function public.hide_message(
  p_message_id uuid,
  p_reason text,
  p_report_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;

  update public.messages
  set moderation_status = 'rejected'
  where id = p_message_id
    and moderation_status is distinct from 'rejected';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'message_not_found_or_already_hidden'; end if;

  insert into public.moderation_actions (actor_id, report_id, message_id, action, reason, metadata)
  values (v_actor, p_report_id, p_message_id, 'message_hidden', p_reason,
          jsonb_build_object('hidden', true));
end; $$;

create function public.restore_message(
  p_message_id uuid,
  p_reason text,
  p_report_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;

  update public.messages
  set moderation_status = 'approved'
  where id = p_message_id
    and moderation_status is distinct from 'approved';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'message_not_found_or_not_hidden'; end if;

  insert into public.moderation_actions (actor_id, report_id, message_id, action, reason, metadata)
  values (v_actor, p_report_id, p_message_id, 'message_restored', p_reason,
          jsonb_build_object('hidden', false));
end; $$;

-- -- 4) Restriction RPC -------------------------------------------------------

create function public.apply_account_restriction(
  p_user_id uuid,
  p_status public.account_status,
  p_reason text,
  p_expires_at timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_current public.account_status;
  v_cluster record;
  v_leaver_name text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_user_id = v_actor then raise exception 'cannot_restrict_self'; end if;
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;

  select status into v_current
  from public.account_restrictions where user_id = p_user_id;
  v_current := coalesce(v_current, 'active');

  -- ---- lift to active ------------------------------------------------------
  if p_status = 'active' then
    if v_current = 'banned' then
      perform public.assert_can_manage_roles();
    else
      perform public.assert_can_moderate();
    end if;

    update public.account_restrictions
    set status = 'active', expires_at = null,
        lifted_by = v_actor, lifted_at = now()
    where user_id = p_user_id;

    insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
    values (v_actor, p_user_id,
            case when v_current = 'banned'
              then 'ban_lifted'::public.moderation_action_type
              else 'suspension_lifted'::public.moderation_action_type
            end,
            p_reason, jsonb_build_object('previous_status', v_current::text));
    return;
  end if;

  -- ---- suspension ----------------------------------------------------------
  if p_status = 'suspended' then
    perform public.assert_can_moderate();

    -- A moderator cannot restrict another staff account.
    if not public.can_manage_roles(v_actor) and exists (
      select 1 from public.user_roles
      where user_id = p_user_id and revoked_at is null
    ) then
      raise exception 'cannot_restrict_staff';
    end if;

    -- Moderators are capped at 7 days (server-enforced).
    if not public.can_manage_roles(v_actor) then
      if p_expires_at is null then raise exception 'expiry_required'; end if;
      if p_expires_at > now() + interval '7 days' then raise exception 'suspension_too_long'; end if;
    end if;

    insert into public.account_restrictions (user_id, status, expires_at, reason, changed_by, changed_at)
    values (p_user_id, 'suspended', p_expires_at, p_reason, v_actor, now())
    on conflict (user_id)
    do update set status = excluded.status, expires_at = excluded.expires_at,
                  reason = excluded.reason, changed_by = excluded.changed_by,
                  changed_at = excluded.changed_at, lifted_by = null, lifted_at = null;

    insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
    values (v_actor, p_user_id, 'suspension_applied', p_reason,
            jsonb_build_object('expires_at', p_expires_at));
    return;
  end if;

  -- ---- permanent ban -------------------------------------------------------
  perform public.assert_can_manage_roles();

  -- Last active admin cannot be banned.
  if exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin' and revoked_at is null
  ) and not exists (
    select 1 from public.user_roles
    where role = 'admin' and revoked_at is null and user_id <> p_user_id
  ) then
    raise exception 'last_admin_required';
  end if;

  -- Revoke every active platform role.
  update public.user_roles
  set revoked_at = now(), revoked_by = v_actor
  where user_id = p_user_id and revoked_at is null;

  -- Depart every active membership and start replacement.
  select display_name into v_leaver_name from public.profiles where id = p_user_id;

  for v_cluster in
    select distinct cm.cluster_id
    from public.cluster_members cm
    where cm.user_id = p_user_id and cm.left_at is null
  loop
    update public.cluster_members set left_at = now()
    where cluster_id = v_cluster.cluster_id and user_id = p_user_id;

    insert into public.notifications (user_id, type, cluster_id, title, body)
    select cm.user_id, 'replacement', v_cluster.cluster_id,
           coalesce(v_leaver_name, 'A member') || ' left the cluster',
           'A spot just opened - we are finding a new member to fill it.'
    from public.cluster_members cm
    where cm.cluster_id = v_cluster.cluster_id and cm.left_at is null;

    perform public.start_replacement(v_cluster.cluster_id);
  end loop;

  insert into public.account_restrictions (user_id, status, reason, changed_by, changed_at)
  values (p_user_id, 'banned', p_reason, v_actor, now())
  on conflict (user_id)
  do update set status = excluded.status, expires_at = null,
                reason = excluded.reason, changed_by = excluded.changed_by,
                changed_at = excluded.changed_at, lifted_by = null, lifted_at = null;

  insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata)
  values (v_actor, p_user_id, 'ban_applied', p_reason, '{}'::jsonb);
end; $$;

-- -- 5) Account deletion: server-side storage reclaim + last-admin guard -------

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_cluster record;
  v_leaver_name text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  -- Last active admin cannot delete the account (would leave zero admins).
  if exists (
    select 1 from public.user_roles
    where user_id = v_user_id and role = 'admin' and revoked_at is null
  ) and not exists (
    select 1 from public.user_roles
    where role = 'admin' and revoked_at is null and user_id <> v_user_id
  ) then
    raise exception 'last_admin_required';
  end if;

  -- Stamp role history as revoked so the partial unique index does not leave a
  -- dangling "active" assignment once the profile row is gone (on delete set null).
  update public.user_roles
  set revoked_at = now(), revoked_by = v_user_id
  where user_id = v_user_id and revoked_at is null;

  -- Reclaim storage server-side, independent of account status / membership.
  -- The browser's old owner/member-scoped cleanup (0050) is no longer relied on.
  -- storage.protect_objects_delete blocks direct deletes unless the
  -- storage.allow_delete_query GUC is set; isolate it to this transaction.
  perform set_config('storage.allow_delete_query', 'true', true);

  delete from storage.objects o
  using public.messages m
  where o.bucket_id = 'chat-images'
    and o.name = m.image_url
    and m.author_id = v_user_id
    and m.image_url is not null;

  delete from storage.objects o
  using public.profiles p
  where o.bucket_id = 'avatars'
    and o.name = p.avatar_url
    and p.id = v_user_id
    and p.avatar_url is not null;

  perform set_config('storage.allow_delete_query', 'false', true);

  select display_name into v_leaver_name
  from public.profiles where id = v_user_id;

  for v_cluster in
    select distinct cm.cluster_id
    from public.cluster_members cm
    where cm.user_id = v_user_id and cm.left_at is null
  loop
    update public.cluster_members set left_at = now()
    where cluster_id = v_cluster.cluster_id and user_id = v_user_id;

    insert into public.notifications (user_id, type, cluster_id, title, body)
    select cm.user_id, 'replacement', v_cluster.cluster_id,
           coalesce(v_leaver_name, 'A member') || ' left the cluster',
           'A spot just opened - we are finding a new member to fill it.'
    from public.cluster_members cm
    where cm.cluster_id = v_cluster.cluster_id and cm.left_at is null;

    perform public.start_replacement(v_cluster.cluster_id);
  end loop;

  delete from auth.users where id = v_user_id;
end; $$;

-- -- 6) Notification read path filters hidden content --------------------------

create or replace function public.get_my_notifications()
returns table (
  id uuid,
  type public.notification_type,
  cluster_id uuid,
  title text,
  body text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with unread_chat as (
    select distinct on (cm.cluster_id)
      m.id as message_id,
      m.cluster_id,
      m.content,
      m.created_at,
      pr.display_name
    from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    join public.messages m on m.cluster_id = cm.cluster_id
    join public.profiles pr on pr.id = m.author_id
    left join public.notification_prefs p
      on p.user_id = cm.user_id and p.cluster_id = cm.cluster_id
    where cm.user_id = auth.uid()
      and cm.left_at is null
      and c.introductions_completed_at is not null
      and (p is null or p.messages)
      and m.deleted_at is null
      and m.moderation_status = 'approved'
      and m.author_id <> auth.uid()
      and m.created_at > cm.last_read_message_at
    order by cm.cluster_id, m.created_at desc, m.id desc
  )
  select n.id, n.type, n.cluster_id, n.title, n.body, n.payload, n.read_at, n.created_at
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
    and public.notification_allowed(p, n.type, n.cluster_id)

  union all

  select
    unread_chat.message_id,
    'message'::public.notification_type,
    unread_chat.cluster_id,
    unread_chat.display_name || ' sent a message',
    case
      when unread_chat.content is null then '[Photo]'
      when unread_chat.content like 'gif:%' then '[GIF]'
      else left(unread_chat.content, 140)
    end,
    jsonb_build_object('message_id', unread_chat.message_id),
    null::timestamptz,
    unread_chat.created_at
  from unread_chat

  order by created_at desc
  limit 100;
$$;

-- -- 7) Grants ---------------------------------------------------------------

grant execute on function
  public.hide_message(uuid, text, uuid),
  public.restore_message(uuid, text, uuid),
  public.apply_account_restriction(uuid, public.account_status, text, timestamptz)
  to authenticated;

grant execute on function
  public.hide_message(uuid, text, uuid),
  public.restore_message(uuid, text, uuid),
  public.apply_account_restriction(uuid, public.account_status, text, timestamptz)
  to service_role;

grant execute on function public.report_member(uuid, uuid, public.report_reason, text, uuid) to authenticated;
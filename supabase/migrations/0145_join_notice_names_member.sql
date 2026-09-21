-- 0145_join_notice_names_member.sql
-- The 'A new member has joined' replacement notice (live body 0144) carries
-- a NULL body/payload and shares the generic `replacement` deep-link to
-- /votes, so tapping it lands members on the votes tab with no hint who
-- joined. Name the joiner and tag the row so clients can route to /members:
--
--   1. accept_invitation(): body becomes '<display name> joined the
--      cluster.' (falls back to 'A new member') and payload becomes
--      {"new_member_id": <joiner uuid>}. The 0144 self-exclusion
--      (joiner gets no notice about themselves), cluster_full guard, round
--      fill, and continuous-refill chain are otherwise byte-for-byte
--      identical.
--   2. fan_out_push_notification() (live body 0137): pass the new member id
--      through to push data as `newMemberId` so tapped pushes can deep-link
--      to the members tab too. Gating, channels, and single-wake behavior
--      are unchanged.

create or replace function public.accept_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_inv record; v_active int; v_joiner_name text;
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

  -- Defensive: never grow a cluster past 8 (legacy orphan invitations/races).
  select count(*) into v_active
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null;
  if v_active >= 8 then raise exception 'cluster_full'; end if;

  update public.invitations set status = 'accepted', responded_at = now()
  where id = p_invitation_id;

  insert into public.cluster_members (cluster_id, user_id)
  values (v_inv.cluster_id, v_inv.user_id);

  delete from public.queue_entries where user_id = v_inv.user_id;

  update public.replacement_rounds
  set status = 'filled', invited_user_id = v_inv.user_id, updated_at = now()
  where cluster_id = v_inv.cluster_id and status = 'inviting';

  select display_name into v_joiner_name from public.profiles where id = v_inv.user_id;

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select user_id, 'replacement', v_inv.cluster_id, 'A new member has joined',
    coalesce(v_joiner_name, 'A new member') || ' joined the cluster.',
    jsonb_build_object('new_member_id', v_inv.user_id)
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null
    and user_id <> v_inv.user_id;

  -- Continuous refill: chain the next cycle while still below 8 members.
  -- The just-filled round is terminal, so at most one invitation is ever
  -- pending per cluster (sequential, never parallel).
  select count(*) into v_active
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null;
  if v_active < 8 then
    if not exists (
      select 1 from public.replacement_rounds
      where cluster_id = v_inv.cluster_id
        and status in ('selecting_candidates', 'voting', 'inviting')
    ) then
      perform public.start_replacement(v_inv.cluster_id);
    end if;
  end if;
end; $$;

create or replace function public.fan_out_push_notification()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pref public.notification_prefs;
  v_data jsonb;
  v_channel text;
  v_queued integer;
begin
  if NEW.cluster_id is not null then
    select * into v_pref
    from public.notification_prefs
    where user_id = NEW.user_id and cluster_id = NEW.cluster_id;
    if not public.notification_allowed(v_pref, NEW.type, NEW.cluster_id) then
      return NEW;
    end if;
  end if;

  if not public.is_account_active(NEW.user_id) then
    return NEW;
  end if;

  if not exists (select 1 from public.push_tokens where user_id = NEW.user_id) then
    return NEW;
  end if;

  v_channel := case
    when NEW.type = 'mention' then 'mentions'
    when NEW.type = 'invitation_received' then 'invites'
    when NEW.type in ('vote_started', 'vote_result', 'replacement', 'report_new', 'appeal_new', 'moderation_notice') then 'governance'
    else 'messages'
  end;

  v_data := jsonb_strip_nulls(jsonb_build_object(
    'v', 1,
    'kind', NEW.type::text,
    'clusterId', NEW.cluster_id,
    'postId', NEW.payload ->> 'post_id',
    'signalId', NEW.payload ->> 'signal_id',
    'newMemberId', NEW.payload ->> 'new_member_id'
  ));

  -- One row per registered token; each delivery is self-contained so status
  -- and attempts are tracked per device, not shared across a user's devices.
  insert into public.push_outbox (user_id, type, title, body, data, channel, expo_push_token)
  select NEW.user_id, NEW.type, NEW.title, NEW.body, v_data, v_channel, pt.expo_push_token
  from public.push_tokens pt
  where pt.user_id = NEW.user_id;

  get diagnostics v_queued = row_count;
  -- Collapse per-row wakes to one per transaction: concurrent transactions
  -- each wake at most once, and the cron pump covers any skipped rows.
  if v_queued > 0 and pg_try_advisory_xact_lock(hashtext('push-wake')) then
    perform public.wake_push_worker();
  end if;

  return NEW;
end; $$;

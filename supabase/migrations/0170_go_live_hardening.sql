-- 0170_go_live_hardening.sql
-- Go-live hardening: close role/MFA enumeration oracles, route trusted
-- server-side cross-user checks through a grantless internal helper, add a
-- batch post-counts RPC, pin search_path on trigger helpers, add missing
-- lookup indexes.
--
-- 1) has_platform_role / is_account_active / has_verified_totp_factor used to
--    accept an arbitrary p_user_id from any authenticated caller, letting any
--    member probe who is staff or has MFA. Now: self, staff, or service_role
--    only. Direct probing raises insufficient_permission.
--
-- 2) Trusted SECURITY DEFINER flows that check OTHER users (the caller never
--    sees the result, so there is no oracle) use is_account_active_internal,
--    which has no client grants at all:
--      fan_out_push_notification()  recipient gate on notification insert
--      fan_out_push_for_message()   recipient gate on chat message insert
--      notify_staff()               staff recipient gate
--      get_eligible_comembers()     picker rows for other members
--      create_created_cluster()     invitee eligibility
--      invite_to_created_cluster()  invitee eligibility

create or replace function public.has_platform_role(p_user_id uuid, p_role public.platform_role)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_is_staff boolean := false;
begin
  if p_user_id is null then
    return false;
  end if;
  if v_caller is null then
    return exists (
      select 1 from public.user_roles r
      where r.user_id = p_user_id and r.role = p_role and r.revoked_at is null
    );
  end if;
  if p_user_id = v_caller then
    return exists (
      select 1 from public.user_roles r
      where r.user_id = p_user_id and r.role = p_role and r.revoked_at is null
    );
  end if;
  select exists (
    select 1 from public.user_roles r
    where r.user_id = v_caller and r.role in ('moderator', 'admin') and r.revoked_at is null
  ) into v_is_staff;
  if v_is_staff then
    return exists (
      select 1 from public.user_roles r
      where r.user_id = p_user_id and r.role = p_role and r.revoked_at is null
    );
  end if;
  raise exception 'insufficient_permission';
end; $$;

create or replace function public.is_account_active(p_user_id uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_status public.account_status;
  v_expires_at timestamptz;
  v_is_staff boolean := false;
begin
  if p_user_id is null then
    return false;
  end if;
  if v_caller is not null and p_user_id <> v_caller then
    select exists (
      select 1 from public.user_roles r
      where r.user_id = v_caller and r.role in ('moderator', 'admin') and r.revoked_at is null
    ) into v_is_staff;
    if not v_is_staff then
      raise exception 'insufficient_permission';
    end if;
  end if;

  select r.status, r.expires_at into v_status, v_expires_at
  from public.account_restrictions r
  where r.user_id = p_user_id;

  if v_status is null or v_status = 'active' then
    return true;
  end if;

  if v_status = 'suspended' and v_expires_at is not null and v_expires_at <= now() then
    return true;
  end if;

  return false;
end; $$;

create or replace function public.has_verified_totp_factor(p_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_is_staff boolean := false;
begin
  if p_user_id is null then
    return false;
  end if;
  if v_caller is not null and p_user_id <> v_caller then
    select exists (
      select 1 from public.user_roles r
      where r.user_id = v_caller and r.role in ('moderator', 'admin') and r.revoked_at is null
    ) into v_is_staff;
    if not v_is_staff then
      raise exception 'insufficient_permission';
    end if;
  end if;
  return exists (
    select 1 from auth.mfa_factors
    where user_id = p_user_id
      and factor_type = 'totp'
      and status = 'verified'
  );
end; $$;

revoke all on function public.has_verified_totp_factor(uuid) from public, anon;
grant execute on function public.has_verified_totp_factor(uuid) to authenticated;

-- Raw account-status check for trusted server-side flows only. No client
-- grants: nested calls from SECURITY DEFINER functions run as the owner.

create or replace function public.is_account_active_internal(p_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_status public.account_status;
  v_expires_at timestamptz;
begin
  if p_user_id is null then
    return false;
  end if;

  select r.status, r.expires_at into v_status, v_expires_at
  from public.account_restrictions r
  where r.user_id = p_user_id;

  if v_status is null or v_status = 'active' then
    return true;
  end if;

  if v_status = 'suspended' and v_expires_at is not null and v_expires_at <= now() then
    return true;
  end if;

  return false;
end; $$;

revoke all on function public.is_account_active_internal(uuid) from public, anon, authenticated;
grant execute on function public.is_account_active_internal(uuid) to service_role;

-- Re-issue the cross-user server flows against the internal helper.
-- Bodies match 0087 (notify_staff), 0166 (both fan-outs), 0168 (picker and
-- created-cluster invites) with only the helper name changed.

create or replace function public.notify_staff(p_type notification_type, p_cluster_id uuid, p_title text, p_body text, p_payload jsonb default null, p_admin_only boolean default false, p_exclude_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select distinct r.user_id, p_type, p_cluster_id, p_title, p_body, p_payload
  from public.user_roles r
  where r.revoked_at is null
    and r.user_id is not null
    and r.role = any (
      case when p_admin_only
           then array['admin']::public.platform_role[]
           else array['admin','moderator']::public.platform_role[]
      end
    )
    and public.is_account_active_internal(r.user_id)
    and r.user_id is distinct from p_exclude_user_id;
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

  if not public.is_account_active_internal(NEW.user_id) then
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
    'commentId', NEW.payload ->> 'comment_id',
    'messageId', NEW.payload ->> 'message_id',
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

create or replace function public.get_eligible_comembers()
returns table (user_id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select distinct p.id, p.display_name, p.avatar_url
  from public.cluster_members mine
  join public.cluster_members theirs on theirs.cluster_id = mine.cluster_id
  join public.profiles p on p.id = theirs.user_id
  where mine.user_id = auth.uid()
    and theirs.user_id <> auth.uid()
    and p.onboarding_completed_at is not null
    and public.is_account_active_internal(p.id)
  order by p.display_name;
$$;

create or replace function public.create_created_cluster(p_name text, p_invitee_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_invitees uuid[] := coalesce(p_invitee_ids, '{}');
  v_id uuid;
  v_cluster_id uuid;
  v_creator_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  perform public.check_rate_limit('create_cluster', 5, interval '1 day');

  if char_length(v_name) < 1 or char_length(v_name) > 50 then
    raise exception 'invalid_name';
  end if;

  -- Dedup, drop nulls and self.
  select coalesce(array_agg(distinct u), '{}') into v_invitees
  from unnest(v_invitees) as u
  where u is not null and u <> auth.uid();

  if coalesce(array_length(v_invitees, 1), 0) < 2
     or coalesce(array_length(v_invitees, 1), 0) > 7 then
    raise exception 'invalid_invite_count';
  end if;

  perform pg_advisory_xact_lock(hashtext('create-cluster:' || auth.uid()::text));

  -- Every invitee must share cluster history with the creator and hold an
  -- active, onboarded account.
  for v_id in select unnest(v_invitees) loop
    if not exists (
      select 1 from public.profiles p
      where p.id = v_id and p.onboarding_completed_at is not null
    ) then raise exception 'not_eligible:%', v_id; end if;

    if not public.is_account_active_internal(v_id) then raise exception 'not_eligible:%', v_id; end if;

    if not exists (
      select 1 from public.cluster_members mine
      join public.cluster_members theirs on theirs.cluster_id = mine.cluster_id
      where mine.user_id = auth.uid() and theirs.user_id = v_id
    ) then raise exception 'not_eligible:%', v_id; end if;
  end loop;

  insert into public.clusters
    (name, matching_mode, mode_label, queue_key, status,
     introductions_completed_at, origin, created_by)
  values
    (v_name, 'open_mix', 'Created', 'custom:' || gen_random_uuid(),
     'active', now(), 'created', auth.uid())
  returning id into v_cluster_id;

  insert into public.cluster_members (cluster_id, user_id)
  values (v_cluster_id, auth.uid());

  select display_name into v_creator_name from public.profiles where id = auth.uid();

  insert into public.invitations (cluster_id, user_id, inviter_id)
  select v_cluster_id, unnest(v_invitees), auth.uid();

  -- Muted inviters stay silent: the rows exist (creator sees Pending, mute
  -- stays private) but no notification - and therefore no push - is written.
  insert into public.notifications (user_id, type, cluster_id, title, body)
  select uid, 'invitation_received', v_cluster_id,
         'You have been invited to join a cluster',
         coalesce(v_creator_name, 'Someone') || ' invited you to join ' || v_name || '.'
  from unnest(v_invitees) as uid
  where not exists (
    select 1 from public.user_mutes m
    where m.user_id = uid and m.muted_user_id = auth.uid()
  );

  return v_cluster_id;
end; $$;

create or replace function public.invite_to_created_cluster(p_cluster_id uuid, p_invitee_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cluster record; v_total int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  perform public.check_rate_limit('create_cluster_invite', 20, interval '1 hour');

  select * into v_cluster from public.clusters where id = p_cluster_id;
  if v_cluster is null or v_cluster.origin <> 'created' then
    raise exception 'not_created_cluster';
  end if;
  if v_cluster.created_by <> auth.uid() then raise exception 'not_creator'; end if;
  if p_invitee_id is null or p_invitee_id = auth.uid() then raise exception 'invalid_invitee'; end if;

  perform pg_advisory_xact_lock(hashtext('created-invite:' || p_cluster_id::text));

  select count(*) into v_total
  from (
    select user_id from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null
    union
    select user_id from public.invitations
    where cluster_id = p_cluster_id and status = 'pending'
  ) t;
  if v_total >= 8 then raise exception 'cluster_full'; end if;

  if exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and user_id = p_invitee_id and left_at is null
  ) then raise exception 'already_member'; end if;

  if exists (
    select 1 from public.invitations
    where cluster_id = p_cluster_id and user_id = p_invitee_id and status = 'pending'
  ) then raise exception 'already_invited'; end if;

  -- An explicit decline is final for this cluster.
  if exists (
    select 1 from public.invitations
    where cluster_id = p_cluster_id and user_id = p_invitee_id and status = 'declined'
  ) then raise exception 'previously_declined'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_invitee_id and p.onboarding_completed_at is not null
  ) then raise exception 'not_eligible'; end if;

  if not public.is_account_active_internal(p_invitee_id) then raise exception 'not_eligible'; end if;

  if not exists (
    select 1 from public.cluster_members mine
    join public.cluster_members theirs on theirs.cluster_id = mine.cluster_id
    where mine.user_id = auth.uid() and theirs.user_id = p_invitee_id
  ) then raise exception 'not_eligible'; end if;

  insert into public.invitations (cluster_id, user_id, inviter_id)
  values (p_cluster_id, p_invitee_id, auth.uid());

  -- Muted inviters stay silent (see create_created_cluster above).
  if not exists (
    select 1 from public.user_mutes m
    where m.user_id = p_invitee_id and m.muted_user_id = auth.uid()
  ) then
    insert into public.notifications (user_id, type, cluster_id, title, body)
    values (p_invitee_id, 'invitation_received', p_cluster_id,
            'You have been invited to join a cluster',
            (select coalesce(display_name, 'Someone') from public.profiles where id = auth.uid())
            || ' invited you to join ' || v_cluster.name || '.');
  end if;
end; $$;

-- Batch variant of get_post_counts for profile pages that list posts from
-- several clusters. One RPC instead of one per cluster. Same visibility as
-- the single-cluster counter: only posts in active-member, unlocked clusters.

create or replace function public.get_post_counts_many(p_cluster_ids uuid[])
returns table (post_id uuid, likes_count integer, comments_count integer)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if p_cluster_ids is null or cardinality(p_cluster_ids) = 0 then
    return;
  end if;
  if cardinality(p_cluster_ids) > 50 then
    raise exception 'too_many_clusters';
  end if;
  return query
    select
      p.id as post_id,
      coalesce(l.cnt, 0)::int as likes_count,
      coalesce(c.cnt, 0)::int as comments_count
    from public.posts p
    left join (
      select pl.post_id, count(*) as cnt
      from public.post_likes pl
      where pl.cluster_id = any (p_cluster_ids)
      group by pl.post_id
    ) l on l.post_id = p.id
    left join (
      select pc.post_id, count(*) as cnt
      from public.post_comments pc
      where pc.cluster_id = any (p_cluster_ids)
        and pc.deleted_at is null
        and pc.moderation_status = 'approved'
      group by pc.post_id
    ) c on c.post_id = p.id
    where p.cluster_id = any (p_cluster_ids)
      and public.is_active_member(p.cluster_id)
      and public.cluster_unlocked(p.cluster_id)
      and p.deleted_at is null
      and p.moderation_status = 'approved';
end;
$function$;

revoke execute on function public.get_post_counts_many(uuid[]) from public, anon;
grant execute on function public.get_post_counts_many(uuid[]) to authenticated;

-- Pin search_path on trigger and helper functions that run without
-- SECURITY DEFINER. Low risk today, but closes mutable search_path hijack.

do $do$
begin
  if to_regprocedure('public.protect_dob()') is not null then
    execute 'alter function public.protect_dob() set search_path = public';
  end if;
  if to_regprocedure('public.fn_queue_key(public.matching_mode, date, text, text, integer)') is not null then
    execute 'alter function public.fn_queue_key(public.matching_mode, date, text, text, integer) set search_path = public';
  end if;
  if to_regprocedure('public.fn_mode_label(public.matching_mode, text)') is not null then
    execute 'alter function public.fn_mode_label(public.matching_mode, text) set search_path = public';
  end if;
  if to_regprocedure('public.touch_push_tokens_updated_at()') is not null then
    execute 'alter function public.touch_push_tokens_updated_at() set search_path = public';
  end if;
end $do$;

-- Missing lookup indexes seen in app query patterns.

create index if not exists posts_author_idx on public.posts (author_id);
create index if not exists post_likes_post_idx on public.post_likes (post_id);
create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);
create index if not exists invitations_user_idx on public.invitations (user_id);
create index if not exists cluster_members_cluster_idx on public.cluster_members (cluster_id);
create index if not exists message_reads_message_idx on public.message_reads (message_id);
create index if not exists user_mutes_muted_idx on public.user_mutes (muted_user_id);

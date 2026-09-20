-- 0142_open_cluster_at_formation.sql
-- Cluster lifecycle simplification (Migration A): a cluster opens the moment the
-- 8th member joins. Introduction answers become an optional in-cluster checklist:
-- they never block access and never remove members.
--
--   1. maybe_form_cluster() inserts status='active' with
--      introductions_completed_at=now() and introductions_deadline=NULL, so
--      cluster_unlocked() is true from row creation and every existing gate
--      (messages/posts RLS, send_message, profile unmasking) opens with no
--      further change. The cluster_formed notification carries open-room copy.
--   2. submit_intro_answers() keeps the answer upsert + own intro_completed_at
--      marking (live body is 0054, guards preserved); the cluster-unlock block
--      is deleted.
--   3. check_intro_deadlines() becomes a no-op (legacy rows are backfilled
--      below, so there is nothing left to scan). The function is kept so the
--      cron unschedule replays idempotently.
--   4. accept_invitation() loses the introductions_deadline extension (live body
--      is 0054, guards preserved).
--   5. The intro-deadline pg_cron job is unscheduled.
--   6. Silent backfill: every remaining status='introductions' cluster becomes
--      active with introductions_completed_at=now(). Per-member
--      intro_completed_at values are preserved as checklist progress. Zero
--      'unlocked' notifications are emitted.

create or replace function public.maybe_form_cluster(p_mode matching_mode, p_queue_key text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_users uuid[];
  v_cluster_id uuid;
  v_label text;
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext('cluster:' || p_mode || ':' || p_queue_key));

  select count(*) into v_count
  from public.queue_entries where mode = p_mode and queue_key = p_queue_key;
  if v_count < 8 then return; end if;

  select array_agg(user_id order by joined_at)
    into v_users
  from (
    select user_id, joined_at from public.queue_entries
    where mode = p_mode and queue_key = p_queue_key
    order by joined_at limit 8
  ) t;

  v_label := public.fn_mode_label(p_mode, p_queue_key);

  insert into public.clusters (name, matching_mode, mode_label, queue_key, status, introductions_completed_at, introductions_deadline)
  values (v_label || ' Cluster', p_mode, v_label, p_queue_key, 'active', now(), null)
  returning id into v_cluster_id;

  insert into public.cluster_members (cluster_id, user_id)
  select v_cluster_id, unnest(v_users);

  delete from public.queue_entries
  where mode = p_mode and queue_key = p_queue_key
    and user_id = any (v_users);

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select u, 'cluster_formed', v_cluster_id,
         'Your cluster is ready',
         'Say hello, and answer the intro questions when you are ready.',
         jsonb_build_object('cluster_id', v_cluster_id, 'mode', p_mode::text)
  from unnest(v_users) as u;

  perform pg_notify('queue_update', jsonb_build_object('mode', p_mode, 'queue_key', p_queue_key)::text);
end; $$;

create or replace function public.submit_intro_answers(p_cluster_id uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_question jsonb;
  v_done int;
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

  -- must be exactly all 5; intros are a checklist now and never unlock the
  -- cluster (clusters open at formation).
  select count(*) into v_done from public.intro_answers
  where user_id = v_user_id and cluster_id = p_cluster_id;
  if v_done < 5 then return; end if;

  update public.cluster_members
  set intro_completed_at = now()
  where cluster_id = p_cluster_id and user_id = v_user_id;
end; $$;

-- No-op: introduction deadlines no longer exist. New clusters form active;
-- remaining 'introductions' rows are backfilled below. Kept (rather than
-- dropped) so the cron unschedule below and any replay stay idempotent.
create or replace function public.check_intro_deadlines() returns void
language plpgsql security definer set search_path = public as $$
begin
  return;
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

  update public.replacement_rounds
  set status = 'filled', invited_user_id = v_inv.user_id, updated_at = now()
  where cluster_id = v_inv.cluster_id and status = 'inviting';

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select user_id, 'replacement', v_inv.cluster_id, 'A new member has joined', null
  from public.cluster_members
  where cluster_id = v_inv.cluster_id and left_at is null;
end; $$;

select cron.unschedule('intro-deadline');

-- Silent backfill: open every cluster still waiting on introductions.
-- Member intro progress is preserved; no 'unlocked' notifications are sent.
update public.clusters
set status = 'active', introductions_completed_at = now(), updated_at = now()
where status = 'introductions';

-- 012_intro_social_functions.sql

create function public.get_intro_questions()
returns table (id smallint, prompt text, "position" smallint)
language sql stable security definer set search_path = public as $$
  select q.id, q.prompt, q.position from public.intro_questions q order by q.position;
$$;

create function public.submit_intro_answers(p_cluster_id uuid, p_answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_question jsonb;
  v_done int;
  v_completed int;
  v_total int;
begin
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

  -- must be exactly all 5
  select count(*) into v_done from public.intro_answers
  where user_id = v_user_id and cluster_id = p_cluster_id;
  if v_done < 5 then return; end if;

  update public.cluster_members
  set intro_completed_at = now()
  where cluster_id = p_cluster_id and user_id = v_user_id;

  -- unlock the cluster once EVERY active member has completed their intro
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
end; $$;

create function public.get_intro_progress(p_cluster_id uuid)
returns table (user_id uuid, display_name text, intro_completed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select cm.user_id, p.display_name, cm.intro_completed_at
  from public.cluster_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.cluster_id = p_cluster_id and cm.left_at is null
  order by cm.intro_completed_at nulls last, cm.joined_at;
$$;

create function public.check_intro_deadlines() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster record;
  v_removed int;
begin
  for v_cluster in
    select id from public.clusters
    where status = 'introductions' and introductions_deadline < now()
  loop
    -- remove non-completers (one round per cluster regardless of how many left)
    update public.cluster_members
    set left_at = now()
    where cluster_id = v_cluster.id
      and left_at is null
      and intro_completed_at is null;

    get diagnostics v_removed = row_count;

    if v_removed > 0 then
      perform public.start_replacement(v_cluster.id);
    end if;

    -- if every remaining active member has completed, unlock
    if not exists (
      select 1 from public.cluster_members
      where cluster_id = v_cluster.id and left_at is null and intro_completed_at is null
    ) and exists (
      select 1 from public.cluster_members
      where cluster_id = v_cluster.id and left_at is null
    ) then
      update public.clusters
      set introductions_completed_at = now(), status = 'active', updated_at = now()
      where id = v_cluster.id;
    end if;
  end loop;
end; $$;

create function public.set_mood(p_cluster_id uuid, p_mood mood) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and user_id = auth.uid() and left_at is null
  ) then raise exception 'not_a_member'; end if;

  insert into public.moods (user_id, cluster_id, mood)
  values (auth.uid(), p_cluster_id, p_mood);
end; $$;

create function public.raise_signal(p_cluster_id uuid, p_prompt text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
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

create function public.reply_signal(p_signal_id uuid, p_content text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.signal_replies (signal_id, author_id, content)
  values (p_signal_id, auth.uid(), p_content);
end; $$;

create function public.set_signal_status(p_signal_id uuid, p_status signal_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.signals
  set status = p_status,
      resolved_at = case when p_status = 'resolved' then now() else null end,
      resolved_by = case when p_status = 'resolved' then auth.uid() else null end
  where id = p_signal_id and author_id = auth.uid();
end; $$;

create function public.send_message(
  p_cluster_id uuid,
  p_content text default null,
  p_image_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_msg_id uuid;
  v_mentions uuid[];
begin
  if not (public.is_active_member(p_cluster_id) and public.cluster_unlocked(p_cluster_id)) then
    raise exception 'chat_locked';
  end if;
  if p_content is null and p_image_url is null then raise exception 'empty_message'; end if;

  insert into public.messages (cluster_id, author_id, content, image_url)
  values (p_cluster_id, auth.uid(), p_content, p_image_url)
  returning id into v_msg_id;

  -- mentions: tokens "@DisplayName" matched case-insensitively against active members
  if p_content is not null then
    select array_agg(distinct m.id) into v_mentions
    from public.cluster_members cm
    join public.profiles m on m.id = cm.user_id
    where cm.cluster_id = p_cluster_id
      and cm.left_at is null
      and m.id <> auth.uid()
      and position('@' || lower(m.display_name) in lower(p_content)) > 0;

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

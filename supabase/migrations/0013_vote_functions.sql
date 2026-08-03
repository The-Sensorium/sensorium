-- 013_vote_functions.sql

create function public.start_replace_vote(p_cluster_id uuid, p_target_member_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
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

create function public.start_name_vote(p_cluster_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
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

create function public.vote_on(p_vote_id uuid, p_choice text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.votes v
    join public.cluster_members cm on cm.cluster_id = v.cluster_id
    where v.id = p_vote_id and cm.user_id = auth.uid() and cm.left_at is null and v.status = 'open'
  ) then raise exception 'vote_not_available'; end if;

  insert into public.vote_responses (vote_id, user_id, choice)
  values (p_vote_id, auth.uid(), p_choice)
  on conflict (vote_id, user_id) do update set choice = excluded.choice, created_at = now();
end; $$;

create function public.fn_quorum(p_active int) returns int
language sql immutable as $$
  select (p_active / 2)::int + 1;
$$;

create function public.close_expired_votes() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_vote record;
  v_yes int; v_no int; v_total int; v_active int; v_quorum int; v_mode matching_mode;
  v_winner uuid; v_result jsonb;
begin
  for v_vote in
    select * from public.votes where status = 'open' and closes_at < now()
  loop
    select matching_mode into v_mode from public.clusters where id = v_vote.cluster_id;

    select count(*) into v_active
    from public.cluster_members
    where cluster_id = v_vote.cluster_id and left_at is null;

    v_quorum := public.fn_quorum(v_active);

    select count(*) filter (where choice = 'yes'),
           count(*) filter (where choice = 'no'),
           count(*)
      into v_yes, v_no, v_total
    from public.vote_responses where vote_id = v_vote.id;

    v_result := jsonb_build_object(
      'yes', v_yes, 'no', v_no, 'cast', v_total,
      'quorum', v_quorum, 'quorum_met', v_total >= v_quorum
    );

    if v_vote.type = 'replace_member' then
      if v_total >= v_quorum and v_yes > v_no then
        v_result := v_result || jsonb_build_object('outcome', 'passed');
        update public.cluster_members set left_at = now()
        where cluster_id = v_vote.cluster_id and user_id = v_vote.target_member_id;
        insert into public.mode_cooldowns (user_id, mode, available_at)
        values (v_vote.target_member_id, v_mode, now() + interval '30 days')
        on conflict (user_id, mode) do update set available_at = excluded.available_at;
        perform public.start_replacement(v_vote.cluster_id);
      else
        v_result := v_result || jsonb_build_object('outcome', 'failed');
      end if;

    elsif v_vote.type = 'change_name' then
      if v_total >= v_quorum and v_yes > v_no then
        update public.clusters set name = v_vote.name_suggestion, updated_at = now()
        where id = v_vote.cluster_id;
        v_result := v_result || jsonb_build_object('outcome', 'passed', 'name', v_vote.name_suggestion);
      else
        v_result := v_result || jsonb_build_object('outcome', 'failed');
      end if;

    elsif v_vote.type = 'select_candidate' then
      if v_total >= v_quorum then
        select choice into v_winner
        from public.vote_responses
        where vote_id = v_vote.id
        group by choice
        order by count(*) desc, min(created_at) asc
        limit 1;

        v_result := v_result || jsonb_build_object('outcome', coalesce(v_winner::text, 'none'));

        update public.replacement_rounds
        set status = 'inviting', invited_user_id = v_winner::uuid, updated_at = now()
        where select_candidate_vote_id = v_vote.id;

        perform public.create_invitation(
          (select id from public.replacement_rounds where select_candidate_vote_id = v_vote.id)
        );
      else
        v_result := v_result || jsonb_build_object('outcome', 'no_quorum');
        update public.replacement_rounds
        set status = 'selecting_candidates', updated_at = now()
        where select_candidate_vote_id = v_vote.id;
        perform public.source_candidates(
          (select id from public.replacement_rounds where select_candidate_vote_id = v_vote.id),
          v_vote.initiated_by
        );
      end if;
    end if;

    update public.votes set status = 'closed', result = v_result where id = v_vote.id;

    insert into public.notifications (user_id, type, cluster_id, title, body)
    select user_id, 'vote_result', v_vote.cluster_id,
           'Vote result: ' || (v_result->>'outcome'), null
    from public.cluster_members
    where cluster_id = v_vote.cluster_id and left_at is null;
  end loop;
end; $$;

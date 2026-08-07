-- 045 — submit_intro_answers must only unlock a cluster that is still in the
-- introductions phase. A replacement member joining an already-active cluster
-- (someone left after formation) now completes their intro in the UI; guard so
-- that marks the member done without re-stamping introductions_completed_at or
-- re-notifying the whole cluster.

drop function if exists public.submit_intro_answers(uuid, jsonb);

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

  -- Unlock the cluster only while it is still in the introductions phase.
  -- A replacement member joining an already-active cluster just gets marked
  -- complete without re-triggering the unlock notification.
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

grant execute on function public.submit_intro_answers(uuid, jsonb) to authenticated;

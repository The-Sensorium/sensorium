-- 0160_vote_close_hardening.sql
--
-- Follow-ups to 0159_vote_early_close.sql:
--   1. close_single_vote() is an internal helper only called by vote_on() and
--      close_expired_votes(), both security definer, so it must not be
--      directly callable. Revoke execute from everyone; internal perform calls
--      keep working under the callers definer rights.
--   2. The select_candidate stray branch hardcoded quorum 0 and
--      quorum_met false. Restore the legacy shape from 0143: real quorum and
--      quorum_met with outcome superseded and no fan-out.

revoke all on function public.close_single_vote(uuid, boolean)
  from public, anon, authenticated;

create or replace function public.close_single_vote(p_vote_id uuid, p_early boolean default false)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_vote record;
  v_yes int; v_no int; v_total int; v_active int; v_quorum int; v_mode matching_mode;
  v_result jsonb; v_updated int;
begin
  select * into v_vote from public.votes where id = p_vote_id for update;
  if not found then return false; end if;
  if v_vote.status <> 'open' then return false; end if;

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

  if v_vote.type = 'select_candidate' then
    if p_early then return false; end if;
    v_result := jsonb_build_object(
      'yes', v_yes, 'no', v_no, 'cast', v_total,
      'quorum', v_quorum, 'quorum_met', v_total >= v_quorum,
      'outcome', 'superseded'
    );
    update public.votes set status = 'closed', result = v_result
    where id = v_vote.id and status = 'open';
    return true;
  end if;

  if p_early then
    if not (v_yes >= v_quorum or v_no >= v_quorum or v_total >= v_active) then
      return false;
    end if;
  else
    if not (v_vote.closes_at < now()) then return false; end if;
  end if;

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
      values (v_vote.target_member_id, v_mode, now() + public.fn_cooldown_interval(v_mode))
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
  end if;

  update public.votes set status = 'closed', result = v_result
  where id = v_vote.id and status = 'open';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return false; end if;

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select user_id, 'vote_result', v_vote.cluster_id,
         'Vote result: ' || (v_result->>'outcome'), null
  from public.cluster_members
  where cluster_id = v_vote.cluster_id and left_at is null;

  return true;
end; $$;

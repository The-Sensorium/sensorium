-- 0132 - Open Mix queue key, mode label, and per-mode cooldown.
-- open_mix forms the same permanent 8-person clusters as the other modes but
-- with no birth-date or location filter: a single global queue ('open') filled
-- first-come, first-served by maybe_form_cluster (generic, unchanged).
-- Cooldown is 7 days for open_mix and 30 days for every other mode, applied in
-- all writers so copy stays consistent. Follows 0131 (enum value must exist).

create or replace function public.fn_cooldown_interval(p_mode public.matching_mode)
returns interval
language sql immutable as $$
  select case p_mode when 'open_mix' then interval '7 days' else interval '30 days' end;
$$;

create or replace function public.fn_queue_key(
  p_mode matching_mode,
  p_dob date,
  p_country text,
  p_area text,
  p_radius int
) returns text
language sql immutable as $$
  select case p_mode
    when 'exact_birthdate' then to_char(p_dob, 'YYYY-MM-DD')
    when 'birth_year_month' then to_char(p_dob, 'YYYY-MM')
    when 'birth_month' then to_char(p_dob, 'MM')
    when 'birth_year' then to_char(p_dob, 'YYYY')
    when 'local' then upper(coalesce(p_country, '')) || ':' || coalesce(p_area, 'unknown') || ':' || coalesce(p_radius, 0)::text
    when 'open_mix' then 'open'
  end;
$$;

create or replace function public.fn_mode_label(p_mode matching_mode, p_key text) returns text
language sql
immutable
set search_path = public
as $function$
  select case p_mode
    when 'exact_birthdate' then to_char(to_date(p_key, 'YYYY-MM-DD'), 'FMMonth DD, YYYY')
    when 'birth_year_month' then replace(to_char(to_date(p_key || '-01', 'YYYY-MM'), 'FMMonth'), ' ', '') || ' ' || split_part(p_key, '-', 1)
    when 'birth_month' then to_char(to_date(p_key || '/01', 'MM/DD'), 'FMMonth')
    when 'birth_year' then p_key
    when 'local' then 'Within ' || split_part(p_key, ':', 3) || 'km of ' || replace(split_part(p_key, ':', 2), '-', ' ')
    when 'open_mix' then 'Open Mix'
  end;
$function$;

-- join_queue (0129) needs no rewrite: it delegates key derivation to
-- fn_queue_key, which now returns 'open' for open_mix (extra p_radius_km, if
-- any, is ignored). Location gate stays local-only; open_mix needs only dob.

create or replace function public.close_expired_votes() returns void
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
  values (auth.uid(), v_mode, now() + public.fn_cooldown_interval(v_mode))
  on conflict (user_id, mode) do update set available_at = excluded.available_at;

  perform public.start_replacement(p_cluster_id);

  insert into public.notifications (user_id, type, cluster_id, title, body)
  select cm.user_id, 'replacement', p_cluster_id,
         coalesce(v_leaver_name, 'A member') || ' left the cluster',
         'A spot just opened - we are finding a new member to fill it.'
  from public.cluster_members cm
  where cm.cluster_id = p_cluster_id and cm.left_at is null;
end; $$;

-- Live body is 0034_discovery_in_cluster.sql (adds cluster_id); 0018 is
-- superseded. Drop first per 0034's precedent so any return-type change
-- applies cleanly.
drop function if exists public.get_my_matching_status();

create function public.get_my_matching_status()
returns table (
  mode matching_mode,
  queue_key text,
  label text,
  joined boolean,
  waiting int,
  cluster_id uuid
)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (
    select dob, country_code, local_area, local_radius_km
    from public.profiles
    where id = auth.uid()
  ),
  keys as (
    select m.mode,
      case
        when m.mode = 'local' and me.local_area is not null
          then public.fn_queue_key(m.mode, me.dob, me.country_code, me.local_area, me.local_radius_km)
        when m.mode = 'open_mix'
          then public.fn_queue_key(m.mode, me.dob, me.country_code, me.local_area, me.local_radius_km)
        when m.mode <> 'local'
          then public.fn_queue_key(m.mode, me.dob, me.country_code, me.local_area, me.local_radius_km)
      end as queue_key
    from me, unnest(enum_range(null::matching_mode)) as m(mode)
  ),
  counts as (
    select mode, queue_key, count(*)::int as waiting
    from public.queue_entries
    group by mode, queue_key
  )
  select k.mode,
         k.queue_key,
         public.fn_mode_label(k.mode, k.queue_key) as label,
         exists (
           select 1 from public.queue_entries q
           where q.user_id = auth.uid() and q.mode = k.mode
         ) as joined,
         coalesce(c.waiting, 0) as waiting,
         (
           select cm.cluster_id
           from public.cluster_members cm
           join public.clusters cl on cl.id = cm.cluster_id
           where cm.user_id = auth.uid()
             and cm.left_at is null
             and cl.matching_mode = k.mode
           limit 1
         ) as cluster_id
  from keys k
  left join counts c on c.mode = k.mode and c.queue_key = k.queue_key
  order by k.mode::text;
$function$;

grant execute on function public.get_my_matching_status() to authenticated;

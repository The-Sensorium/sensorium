-- 011_matching_functions.sql

create function public.fn_queue_key(
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
  end;
$$;

create function public.fn_mode_label(p_mode matching_mode, p_key text) returns text
language sql immutable as $$
  select case p_mode
    when 'exact_birthdate' then to_char(to_date(p_key, 'YYYY-MM-DD'), 'FMMonth DD, YYYY')
    when 'birth_year_month' then replace(to_char(to_date(p_key || '-01', 'YYYY-MM'), 'FMMonth'), ' ', '') || ' ' || split_part(p_key, '-', 1)
    when 'birth_month' then to_char(to_date(p_key || '/01', 'MM/DD'), 'FMMonth')
    when 'birth_year' then p_key
    when 'local' then 'Within ' || split_part(p_key, ':', 3) || 'km of ' || replace(split_part(p_key, ':', 2), '-', ' ')
  end;
$$;

create function public.maybe_form_cluster(p_mode matching_mode, p_queue_key text) returns void
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

  insert into public.clusters (name, matching_mode, mode_label, queue_key, status, introductions_deadline)
  values (v_label || ' Cluster', p_mode, v_label, p_queue_key, 'introductions', now() + interval '72 hours')
  returning id into v_cluster_id;

  insert into public.cluster_members (cluster_id, user_id)
  select v_cluster_id, unnest(v_users);

  delete from public.queue_entries
  where mode = p_mode and queue_key = p_queue_key
    and user_id = any (v_users);

  insert into public.notifications (user_id, type, cluster_id, title, body, payload)
  select u, 'cluster_formed', v_cluster_id,
         'Your cluster is ready',
         'Complete your introductions within 72 hours.',
         jsonb_build_object('cluster_id', v_cluster_id, 'mode', p_mode::text)
  from unnest(v_users) as u;

  perform pg_notify('queue_update', jsonb_build_object('mode', p_mode, 'queue_key', p_queue_key)::text);
end; $$;

create function public.queue_entries_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'DELETE') then
    perform public.maybe_form_cluster(
      coalesce(new.mode, old.mode),
      coalesce(new.queue_key, old.queue_key)
    );
  end if;
  return coalesce(new, old);
end; $$;

create trigger queue_entries_formation
  after insert or delete on public.queue_entries
  for each row execute function public.queue_entries_change();

create function public.join_queue(p_mode matching_mode, p_radius_km int default null)
returns table (queue_key text, waiting int)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_key text;
  v_count int;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;

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

  perform public.maybe_form_cluster(p_mode, v_key);

  select count(*) into v_count
  from public.queue_entries q where q.mode = p_mode and q.queue_key = v_key;

  return query select v_key, v_count;
end; $$;

create function public.leave_queue(p_mode matching_mode) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.queue_entries
  where user_id = auth.uid() and mode = p_mode;
end; $$;

create function public.get_queue_count(p_mode matching_mode, p_queue_key text)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.queue_entries
  where mode = p_mode and queue_key = p_queue_key;
$$;

create function public.get_my_queue_keys()
returns table (mode matching_mode, queue_key text, waiting int)
language sql stable security definer set search_path = public as $$
  select q.mode, q.queue_key,
         (select count(*) from public.queue_entries q2
           where q2.mode = q.mode and q2.queue_key = q.queue_key)::int as waiting
  from public.queue_entries q
  where q.user_id = auth.uid();
$$;

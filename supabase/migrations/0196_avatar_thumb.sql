-- 0196_avatar_thumb.sql
-- Dual-variant avatars: keep `profiles.avatar_url` as the 1024px full image
-- for fullscreen viewers, add nullable `profiles.avatar_thumb_url` as the
-- 256px list thumbnail. Old rows keep thumb null and clients fall back to
-- the full path until the user re-uploads.
--
-- Both files live under `avatars/{userId}/...`, so the existing RLS stays:
-- `avatars_member_read` (0032) for reads, `avatars_owner_delete` (0050) for
-- deletes. Bucket size limit and mime allow-list are unchanged.
--
-- Every RPC that projects `avatar_url` gains `avatar_thumb_url` with the
-- identical masking rule. Storage enumeration and account deletion reclaim
-- both objects.

alter table public.profiles
  add column if not exists avatar_thumb_url text;

-- -- get_member_profiles (live body is 0190) ----------------------------------
drop function if exists public.get_member_profiles(uuid);

create function public.get_member_profiles(p_cluster_id uuid)
returns table (
  id uuid,
  display_name text,
  country_code text,
  birth_year smallint,
  current_status text,
  avatar_url text,
  avatar_thumb_url text,
  bio text,
  pronouns text,
  onboarding_completed_at timestamptz,
  last_read_message_at timestamptz,
  timezone text,
  manual_status public.profile_status
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.display_name,
    p.country_code,
    case when c.matching_mode = 'local' then null else p.birth_year end,
    p.current_status,
    case
      when c.introductions_completed_at is not null then p.avatar_url else null
    end,
    case
      when c.introductions_completed_at is not null then p.avatar_thumb_url else null
    end,
    case
      when c.introductions_completed_at is not null then p.bio else null
    end,
    p.pronouns,
    p.onboarding_completed_at,
    cm.last_read_message_at,
    p.timezone,
    p.manual_status
  from public.profiles p
  join public.cluster_members cm on cm.user_id = p.id
  join public.clusters c on c.id = cm.cluster_id
  where cm.cluster_id = p_cluster_id
    and cm.left_at is null
    and exists (
      select 1 from public.cluster_members me
      where me.cluster_id = p_cluster_id
        and me.user_id = auth.uid()
        and me.left_at is null
    );
$$;

grant execute on function public.get_member_profiles(uuid) to authenticated;

-- -- get_candidate_profiles (live body is 0023) -------------------------------
drop function if exists public.get_candidate_profiles(uuid);

create function public.get_candidate_profiles(p_round_id uuid)
returns table (user_id uuid, display_name text, avatar_url text, avatar_thumb_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name,
         case when public.cluster_unlocked(r.cluster_id) then p.avatar_url else null end,
         case when public.cluster_unlocked(r.cluster_id) then p.avatar_thumb_url else null end
  from public.replacement_rounds r
  cross join unnest(coalesce(r.candidate_pool, '{}')) with ordinality as c(user_id, ord)
  join public.profiles p on p.id = c.user_id
  where r.id = p_round_id
    and public.is_active_member(r.cluster_id)
  order by c.ord
  limit 3;
$$;

grant execute on function public.get_candidate_profiles(uuid) to authenticated;

-- -- get_message_reads (live body is 0049) ------------------------------------
drop function if exists public.get_message_reads(uuid);

create function public.get_message_reads(p_message_id uuid)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  avatar_thumb_url text,
  read_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.display_name,
    case
      when c.introductions_completed_at is not null then p.avatar_url else null
    end,
    case
      when c.introductions_completed_at is not null then p.avatar_thumb_url else null
    end,
    r.read_at
  from public.message_reads r
  join public.profiles p on p.id = r.user_id
  join public.messages m on m.id = r.message_id
  join public.clusters c on c.id = m.cluster_id
  join public.cluster_members cm
    on cm.cluster_id = m.cluster_id and cm.user_id = r.user_id
  where r.message_id = p_message_id
    and cm.left_at is null
    and exists (
      select 1
      from public.cluster_members me
      where me.cluster_id = m.cluster_id
        and me.user_id = auth.uid()
        and me.left_at is null
    )
  order by r.read_at desc;
$$;

grant execute on function public.get_message_reads(uuid) to authenticated;

-- -- get_my_mutes (live body is 0093) -----------------------------------------
drop function if exists public.get_my_mutes();

create function public.get_my_mutes()
returns table (
  muted_user_id uuid,
  display_name text,
  avatar_url text,
  avatar_thumb_url text
)
language sql stable security definer set search_path = public as $$
  select m.muted_user_id, p.display_name, p.avatar_url, p.avatar_thumb_url
  from public.user_mutes m
  join public.profiles p on p.id = m.muted_user_id
  where m.user_id = auth.uid()
  order by m.created_at desc;
$$;

grant execute on function public.get_my_mutes() to authenticated;
grant execute on function public.get_my_mutes() to service_role;

-- -- get_eligible_comembers (live body is 0170) --------------------------------
drop function if exists public.get_eligible_comembers();

create function public.get_eligible_comembers()
returns table (user_id uuid, display_name text, avatar_url text, avatar_thumb_url text)
language sql stable security definer set search_path = public as $$
  select distinct p.id, p.display_name, p.avatar_url, p.avatar_thumb_url
  from public.cluster_members mine
  join public.cluster_members theirs on theirs.cluster_id = mine.cluster_id
  join public.profiles p on p.id = theirs.user_id
  where mine.user_id = auth.uid()
    and theirs.user_id <> auth.uid()
    and p.onboarding_completed_at is not null
    and public.is_account_active_internal(p.id)
  order by p.display_name;
$$;

grant execute on function public.get_eligible_comembers() to authenticated;

-- -- get_created_pending_invites (live body is 0168) ---------------------------
drop function if exists public.get_created_pending_invites(uuid);

create function public.get_created_pending_invites(p_cluster_id uuid)
returns table (invitation_id uuid, user_id uuid, display_name text,
               avatar_url text, avatar_thumb_url text,
               created_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_cluster record;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_cluster from public.clusters where id = p_cluster_id;
  if v_cluster is null or v_cluster.origin <> 'created' then
    raise exception 'not_created_cluster';
  end if;
  if not public.is_active_member(p_cluster_id) then raise exception 'not_a_member'; end if;

  return query
  select i.id, i.user_id, p.display_name, p.avatar_url, p.avatar_thumb_url, i.created_at, i.expires_at
  from public.invitations i
  join public.profiles p on p.id = i.user_id
  where i.cluster_id = p_cluster_id and i.status = 'pending'
  order by i.created_at asc;
end; $$;

grant execute on function public.get_created_pending_invites(uuid) to authenticated;

-- -- get_my_storage_objects (live body is 0193) --------------------------------
-- Return type is unchanged; the body now unions both avatar columns.
create or replace function public.get_my_storage_objects()
returns table (bucket text, path text)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  return query
  select distinct 'avatars'::text as bucket, avatar_url as path
  from public.profiles
  where id = auth.uid() and avatar_url is not null
  union
  select distinct 'avatars'::text as bucket, avatar_thumb_url as path
  from public.profiles
  where id = auth.uid() and avatar_thumb_url is not null
  union all
  select distinct 'chat-images', image_url
  from public.messages
  where author_id = auth.uid() and image_url is not null
  union all
  select distinct 'posts-images', image_url
  from public.posts
  where author_id = auth.uid() and image_url is not null
  union all
  select distinct 'posts-images', image_url
  from public.post_comments
  where author_id = auth.uid() and image_url is not null;
end; $function$;

-- -- get_storage_objects_for_account (live body is 0195) -----------------------
create or replace function public.get_storage_objects_for_account(
  p_user_id uuid,
  p_offset integer default 0,
  p_limit integer default 1000
)
returns table (bucket text, path text)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if p_user_id is null then return; end if;

  return query
  select distinct t.bucket, t.path
  from (
    select 'avatars'::text as bucket, avatar_url as path
    from public.profiles
    where id = p_user_id and avatar_url is not null
    union all
    select 'avatars'::text as bucket, avatar_thumb_url as path
    from public.profiles
    where id = p_user_id and avatar_thumb_url is not null
    union all
    select 'chat-images', image_url
    from public.messages
    where author_id = p_user_id and image_url is not null
    union all
    select 'posts-images', image_url
    from public.posts
    where author_id = p_user_id and image_url is not null
    union all
    select 'posts-images', image_url
    from public.post_comments
    where author_id = p_user_id and image_url is not null
  ) as t(bucket, path)
  order by t.bucket, t.path
  limit greatest(least(coalesce(p_limit, 1000), 1000), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end; $function$;

revoke all on function public.get_storage_objects_for_account(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_storage_objects_for_account(uuid, integer, integer)
  to service_role;

-- -- delete_my_account avatar reclaim (live body is 0193) ----------------------
-- Reclaim both avatar objects. Other blocks are byte-identical to 0193.
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

  if exists (
    select 1 from public.user_roles
    where user_id = v_user_id and role = 'admin' and revoked_at is null
  ) and not exists (
    select 1 from public.user_roles
    where role = 'admin' and revoked_at is null and user_id <> v_user_id
  ) then
    raise exception 'last_admin_required';
  end if;

  update public.user_roles
  set revoked_at = now(), revoked_by = v_user_id
  where user_id = v_user_id and revoked_at is null;

  perform set_config('storage.allow_delete_query', 'true', true);

  delete from storage.objects o
  using public.messages m
  where o.bucket_id = 'chat-images'
    and o.name = m.image_url
    and m.author_id = v_user_id
    and m.image_url is not null;

  delete from storage.objects o
  using public.posts p
  where o.bucket_id = 'posts-images'
    and o.name = p.image_url
    and p.author_id = v_user_id
    and p.image_url is not null;

  delete from storage.objects o
  using public.post_comments pc
  where o.bucket_id = 'posts-images'
    and o.name = pc.image_url
    and pc.author_id = v_user_id
    and pc.image_url is not null;

  delete from storage.objects o
  using public.profiles p
  where o.bucket_id = 'avatars'
    and o.name = p.avatar_url
    and p.id = v_user_id
    and p.avatar_url is not null;

  delete from storage.objects o
  using public.profiles p
  where o.bucket_id = 'avatars'
    and o.name = p.avatar_thumb_url
    and p.id = v_user_id
    and p.avatar_thumb_url is not null;

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

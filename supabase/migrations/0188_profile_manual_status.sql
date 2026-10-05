-- 0188_profile_manual_status.sql
-- User-selected profile status (Online, Away, Busy, Invisible) stored on
-- profiles.manual_status. This is separate from the automatic technical
-- presence (Supabase Realtime Presence, ephemeral, per cluster) and from
-- profiles.current_status (free-text status message) and
-- profiles.availability (available/busy/dnd work-state badge). Existing rows
-- default to 'online'; the members-only guard and avatar/bio masking in
-- get_member_profiles are unchanged.

create type public.profile_status as enum ('online', 'away', 'busy', 'invisible');

alter table public.profiles
  add column manual_status public.profile_status not null default 'online';

drop function public.get_member_profiles(p_cluster_id uuid);

create function public.get_member_profiles(p_cluster_id uuid)
returns table (
  id uuid,
  display_name text,
  country_code text,
  birth_year smallint,
  current_status text,
  availability public.availability,
  avatar_url text,
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
    p.birth_year,
    p.current_status,
    p.availability,
    case
      when c.introductions_completed_at is not null then p.avatar_url else null
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

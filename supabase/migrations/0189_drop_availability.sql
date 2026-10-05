-- 0189_drop_availability.sql
-- Remove profiles.availability (available/busy/dnd) and its enum. The column
-- was never user-editable and never surfaced after the manual status
-- (0188) replaced the profile detail badge, so every row still holds the
-- default and nothing meaningful is lost. get_member_profiles is re-issued
-- without the column; the members-only guard and avatar/bio masking are
-- unchanged. No RLS policy referenced the column, so none changes.

drop function public.get_member_profiles(p_cluster_id uuid);

alter table public.profiles
  drop column availability;

drop type public.availability;

create function public.get_member_profiles(p_cluster_id uuid)
returns table (
  id uuid,
  display_name text,
  country_code text,
  birth_year smallint,
  current_status text,
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

-- 0161_profile_timezone.sql
-- Per-member IANA timezone for the Members list local-time display.
-- Country code alone cannot resolve local time (large countries span
-- multiple zones), so each profile stores its own zone (e.g.
-- America/New_York). Nullable so existing rows stay valid until the member
-- sets it in onboarding or Settings; the UI hides the clock when null.
-- The members-only guard and avatar/bio masking are unchanged.

alter table public.profiles
  add column timezone text check (timezone is null or char_length(timezone) <= 64);

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
  timezone text
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
    p.timezone
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

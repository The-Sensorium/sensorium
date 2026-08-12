-- 0048_read_receipts.sql
-- Expose each active member's read watermark so rooms can render "Seen by"
-- receipts. The watermark is already maintained by mark_cluster_read /
-- mark_all_read (0038); this only surfaces it through the shared member RPC.
-- The members-only guard is unchanged, and no realtime config changes: the
-- existing cluster_members UPDATE handling refreshes the member query live.

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
  last_read_message_at timestamptz
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
    cm.last_read_message_at
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

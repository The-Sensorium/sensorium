-- 0093_my_mutes_with_profiles.sql
-- Mute list with profile display data for the Safety section. Profiles are
-- RLS-locked outside cluster context, so the viewer's own list resolves names
-- server-side. Returns the viewer's rows only, newest first.

create function public.get_my_mutes()
returns table (
  muted_user_id uuid,
  display_name text,
  avatar_url text
)
language sql stable security definer set search_path = public as $$
  select m.muted_user_id, p.display_name, p.avatar_url
  from public.user_mutes m
  join public.profiles p on p.id = m.muted_user_id
  where m.user_id = auth.uid()
  order by m.created_at desc;
$$;

grant execute on function public.get_my_mutes() to authenticated;
grant execute on function public.get_my_mutes() to service_role;

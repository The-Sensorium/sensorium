-- 0042_public_cluster_directory_formed_at.sql
-- Extend the discovery directory RPC with the cluster's formation date so the
-- public cluster tile can show when it was formed. Migrations are immutable,
-- so this recreates 0041's function as a new migration.

drop function if exists public.get_clusters_by_mode(public.matching_mode);

create function public.get_clusters_by_mode(p_mode public.matching_mode)
returns table (
  id uuid,
  name text,
  matching_mode public.matching_mode,
  mode_label text,
  status public.cluster_status,
  member_count bigint,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.name,
    c.matching_mode,
    c.mode_label,
    c.status,
    (select count(*) from public.cluster_members a
     where a.cluster_id = c.id and a.left_at is null)::bigint,
    c.created_at
  from public.clusters c
  where c.matching_mode = p_mode
    and c.status <> 'archived'
  order by c.created_at desc;
$$;

grant execute on function public.get_clusters_by_mode(public.matching_mode) to authenticated;
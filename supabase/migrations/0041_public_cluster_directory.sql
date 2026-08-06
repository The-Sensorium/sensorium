-- 0041_public_cluster_directory.sql
-- A browseable (but non-sensitive) cluster directory for Discovery. Clusters
-- are RLS-readable only by their own members (0003), so a public directory
-- must project just public metadata (name, status, member count) through
-- security-definer RPCs. These never expose introductions, messages, or
-- membership.

create function public.get_public_cluster_counts()
returns table (
  mode public.matching_mode,
  cluster_count bigint
)
language sql stable security definer set search_path = public as $$
  select c.matching_mode, count(*)::bigint
  from public.clusters c
  where c.status <> 'archived'
  group by c.matching_mode;
$$;

grant execute on function public.get_public_cluster_counts() to authenticated;

create function public.get_clusters_by_mode(p_mode public.matching_mode)
returns table (
  id uuid,
  name text,
  matching_mode public.matching_mode,
  mode_label text,
  status public.cluster_status,
  member_count bigint
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.name,
    c.matching_mode,
    c.mode_label,
    c.status,
    (select count(*) from public.cluster_members a
     where a.cluster_id = c.id and a.left_at is null)::bigint
  from public.clusters c
  where c.matching_mode = p_mode
    and c.status <> 'archived'
  order by c.created_at desc;
$$;

grant execute on function public.get_clusters_by_mode(public.matching_mode) to authenticated;
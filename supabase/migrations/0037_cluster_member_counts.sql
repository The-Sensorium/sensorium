-- 0037_cluster_member_counts.sql
-- Replace the client's full-table scan for cluster member counts (the old
-- useMyClusters fetched every active membership in the whole database to
-- count each of the caller's clusters) with a security-definer RPC that
-- computes the count in the database, per cluster. Returns the caller's
-- clusters with the fields the UI needs plus member_count.

create function public.get_my_clusters()
returns table (
  id uuid,
  name text,
  matching_mode public.matching_mode,
  mode_label text,
  queue_key text,
  status public.cluster_status,
  introductions_deadline timestamptz,
  introductions_completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  joined_at timestamptz,
  member_count bigint
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.name,
    c.matching_mode,
    c.mode_label,
    c.queue_key,
    c.status,
    c.introductions_deadline,
    c.introductions_completed_at,
    c.created_at,
    c.updated_at,
    cm.joined_at,
    (select count(*) from public.cluster_members a
     where a.cluster_id = c.id and a.left_at is null)::bigint
  from public.cluster_members cm
  join public.clusters c on c.id = cm.cluster_id
  where cm.user_id = auth.uid()
    and cm.left_at is null
  order by cm.joined_at desc;
$$;

grant execute on function public.get_my_clusters() to authenticated;

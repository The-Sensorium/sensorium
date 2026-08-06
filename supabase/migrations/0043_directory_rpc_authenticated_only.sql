-- 0043_directory_rpc_authenticated_only.sql
-- Supabase default privileges grant EXECUTE on every schema function to PUBLIC
-- (the implicit all-roles pseudo-grant) AND explicitly to "anon" and
-- "service_role". A sessionless client can therefore enumerate cluster
-- names/status/member counts through the discovery directory RPCs. Discovery is
-- an authenticated, onboarded experience, so revoke anonymous access (both the
-- PUBLIC pseudo-grant and the explicit anon grant) and keep the grant for
-- signed-in users. service_role is intentionally left untouched (it may call
-- anything as the trusted admin role).

revoke execute on function public.get_public_cluster_counts() from public, anon;
revoke execute on function public.get_clusters_by_mode(public.matching_mode) from public, anon;

grant execute on function public.get_public_cluster_counts() to authenticated;
grant execute on function public.get_clusters_by_mode(public.matching_mode) to authenticated;
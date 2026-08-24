-- 0083_posts_service_role_grants.sql
-- Backfill SELECT grants for service_role on posts tables created after the
-- blanket grant in 0019. Without these, the admin (service_role) client used
-- by integration tests cannot read these tables through PostgREST.

grant select on public.posts to service_role;
grant select on public.post_comments to service_role;
grant select on public.post_likes to service_role;
grant select on public.comment_likes to service_role;

-- 0112_cluster_calls_service_role_grants.sql
-- Backfill service_role privileges for the calls tables created in 0107. The
-- blanket grant in 0019 predates them, and the newer Postgres image no longer
-- grants DML by default, so without this the service-role client cannot touch
-- them through PostgREST — breaking integration tests, admin tooling, and
-- create-call-token's REST lookups. Mirrors 0083.

grant select, insert, update, delete on public.calls to service_role;
grant select, insert, update, delete on public.call_participants to service_role;

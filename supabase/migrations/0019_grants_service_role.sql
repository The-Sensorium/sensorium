-- 0019 — Base table privileges for the `service_role` role.
--
-- Same rationale as 0017: newer local postgres images do not grant DML to any
-- role by default. The service role bypasses RLS but still needs table grants
-- to operate through PostgREST / the admin API. This mirrors the authenticated
-- grants (0017) plus the write privileges the service role uses for seeding,
-- admin, and maintenance tasks.

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;

-- 0113_public_table_grants.sql
-- Auto-expose of new tables is off (config.toml), matching the new Postgres
-- default and the hosted projects. The blanket grant in 0019 predates many
-- tables, so make the invariants explicit for every public table:
--   * service_role can fully use it (admin tooling, Edge Functions via REST);
--   * anon gets nothing (the app always signs in; public reads go through
--     security definer RPCs).
-- Default privileges keep future tables covered. The integration test
-- tests/integration/privileges.test.ts fails if either invariant drifts.

do $$
declare
  r record;
begin
  for r in
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    execute format('grant select, insert, update, delete on public.%I to service_role', r.table_name);
    execute format('revoke all on public.%I from anon', r.table_name);
  end loop;
end $$;

grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- 0104_push_wake_grants.sql
-- Grants the 0103 wake path the privileges it needs beyond the 0100 surface.
--   1. wake_push_worker() is a security-definer internal helper (called by the
--      fan-out trigger and the cron pump). Grant service_role execute so the
--      backend can also poke the worker on demand, and so integration tests
--      can exercise it directly.
--   2. push_settings was SELECT-only for service_role (0100); writes were left
--      to the CI migration workflow. Granting service_role UPDATE also lets the
--      backend flip push delivery on/off as a kill-switch, and lets tests
--      enable/disable the pipeline.

grant execute on function public.wake_push_worker() to service_role;

grant select, update on public.push_settings to service_role;

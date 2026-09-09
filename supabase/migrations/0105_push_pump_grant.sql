-- 0105_push_pump_grant.sql
-- 0100 ran the push pump under the pg_cron postgres role and never granted it
-- to service_role (the email pump has the same shape). Grant service_role
-- execute so the backend/ops can trigger a drain on demand and so tests can
-- exercise the pump path directly. Like wake_push_worker (0104), it is a
-- security-definer no-op while push_settings is disabled.

grant execute on function public.pump_push_notifications() to service_role;
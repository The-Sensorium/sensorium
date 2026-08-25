-- 0086_staff_notification_types.sql
-- Adds the staff-facing notification types ahead of the migration that emits
-- them (0087). PostgreSQL forbids using a freshly added enum value in the same
-- transaction, so these values land in their own migration and 0087 may
-- reference them, matching the 0055 (moderation_notice) precedent.
--
-- These events target the moderation team, not cluster members:
--   report_new  -> active moderators + admins
--   appeal_new  -> active admins only

alter type public.notification_type add value 'report_new';
alter type public.notification_type add value 'appeal_new';

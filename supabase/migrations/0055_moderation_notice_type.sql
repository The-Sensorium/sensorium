-- 0055_moderation_notice_type.sql
-- Adds the `moderation_notice` notification type ahead of the role
-- administration migration that references it. PostgreSQL forbids using a
-- freshly added enum value in the same transaction, so this value lands in its
-- own migration and 0056 (role administration) may compare against it.

alter type public.notification_type add value 'moderation_notice';
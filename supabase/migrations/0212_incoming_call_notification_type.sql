-- 0212_incoming_call_notification_type.sql
-- Ephemeral notification rows that ring mobile members when a cluster call
-- starts. Kept separate from the functions that use the value so the enum
-- commit lands before any migration references it.

alter type public.notification_type add value if not exists 'incoming_call';

-- 0197_signal_notification_types.sql
-- Notification enum values for targeted Signal follow-ups (functions land in
-- 0198). Kept separate so the new labels are committed before any function
-- body references them; Postgres rejects same-transaction use of a freshly
-- added enum value (SQLSTATE 55P04). Follows the 0131/0146/0171 pattern.
-- Never edit an applied migration; this only adds.

alter type public.notification_type add value if not exists 'signal_reply';
alter type public.notification_type add value if not exists 'signal_status';

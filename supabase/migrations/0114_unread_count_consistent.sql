-- 0114_unread_count_consistent.sql
-- The unread badge and the notification center drew from two drifting queries:
-- get_my_notifications (0051) synthesizes one `message` row per cluster with
-- unread chat and hides non-approved messages, while get_unread_notification_count
-- (0087) counted every unread message and ignored moderation_status. A cluster
-- with three unread messages therefore badged 3 but listed 1, and a message
-- hidden by moderation badged without listing.
--
-- Derive the badge from the very projection the center renders so the two can
-- never drift again: the badge is exactly the number of unread rows shown.

create or replace function public.get_unread_notification_count()
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*)
  from public.get_my_notifications() n
  where n.read_at is null;
$$;

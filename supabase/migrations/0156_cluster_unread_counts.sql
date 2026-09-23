-- 0156_cluster_unread_counts.sql
-- Per-cluster unread chat counts for the cluster cards, and removal of the
-- synthesized per-cluster `message` rows from the notification center.
--
-- Background: get_my_notifications() (0134) unioned stored rows with one
-- synthesized `message` row per cluster with unread chat, and
-- get_unread_notification_count() (0134) counted 1 per chat cluster via an
-- EXISTS probe. Chat read state is ephemeral (cleared by mark_cluster_read),
-- so it belongs on the cluster cards, not in the notification history.
--
-- This migration:
--   1. Adds get_unread_chat_counts() returning one row per cluster with
--      unread chat (missing row means 0). Same watermark, prefs, and
--      moderation gating as 0134, reusing messages_unread_idx. One batched
--      call for all clusters, never one call per card.
--   2. Re-issues get_my_notifications() without the chat branch (stored rows
--      only, same columns, same prefs filter, same LIMIT 100). Mentions
--      (including @everyone broadcasts), reactions, votes, invitations,
--      signals, and post events are unchanged.
--   3. Re-issues get_unread_notification_count() as stored unread only.
--      Plain chat is excluded: it lives on the cluster cards, and tab-badging
--      it would double-count entries the center no longer shows. This replaces
--      the 0114 invariant (badge equals rows shown) with: header equals
--      stored unread, cards carry chat.
--
-- Rollback (forward migration, never restore): re-issue
-- get_my_notifications() from the 0134 body to restore chat synthesis, and
-- revert get_unread_notification_count() to the 0134 EXISTS version. Both
-- bodies are preserved in git history under
-- supabase/migrations/0134_notifications_unread_perf.sql.

create function public.get_unread_chat_counts()
returns table (
  cluster_id uuid,
  unread_count bigint
)
language sql stable security definer set search_path = public as $$
  with my_clusters as (
    select cm.cluster_id, cm.last_read_message_at
    from public.cluster_members cm
    join public.clusters c on c.id = cm.cluster_id
    left join public.notification_prefs p
      on p.user_id = cm.user_id and p.cluster_id = cm.cluster_id
    where cm.user_id = auth.uid()
      and cm.left_at is null
      and c.introductions_completed_at is not null
      and (p is null or p.messages)
  )
  select mc.cluster_id, count(m.id) as unread_count
  from my_clusters mc
  join public.messages m on m.cluster_id = mc.cluster_id
  where m.deleted_at is null
    and m.moderation_status = 'approved'
    and m.author_id <> auth.uid()
    and m.created_at > mc.last_read_message_at
  group by mc.cluster_id;
$$;

create or replace function public.get_my_notifications()
returns table (
  id uuid,
  type public.notification_type,
  cluster_id uuid,
  title text,
  body text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.cluster_id, n.title, n.body, n.payload, n.read_at, n.created_at
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
    and n.type not in ('report_new', 'appeal_new')
    and public.notification_allowed(p, n.type, n.cluster_id)

  order by created_at desc
  limit 100;
$$;

create or replace function public.get_unread_notification_count()
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*)
  from public.notifications n
  left join public.notification_prefs p
    on p.user_id = n.user_id and p.cluster_id = n.cluster_id
  where n.user_id = auth.uid()
    and n.read_at is null
    and n.type not in ('report_new', 'appeal_new')
    and public.notification_allowed(p, n.type, n.cluster_id);
$$;

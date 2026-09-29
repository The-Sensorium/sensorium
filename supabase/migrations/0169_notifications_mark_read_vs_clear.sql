-- 0169_notifications_mark_read_vs_clear.sql
-- Split bulk semantics: Mark all read keeps history, Clear all empties it.
--
-- Before, mark_all_read deleted the caller's stored notification rows (0133,
-- 0154), so the center emptied on bulk read. The product requirement is now:
-- Mark all read marks every stored row read (rows stay visible as read
-- history, badge drops to zero) while a separate Clear all action
-- permanently deletes them. Chat watermark + batched message_reads freezing
-- are unchanged in both paths, so bulk actions still clear the per-cluster
-- card badges (get_unread_chat_counts) like before.
--
--   1. mark_all_read() reverts to UPDATE read_at (batched receipt freeze and
--      watermark advance preserved from 0154).
--   2. clear_all_notifications() deletes the caller's stored rows with the
--      same receipt freeze + watermark advance, so Clear all truly empties
--      the center and the card badges.
-- Both are security definer guarded to auth.uid() rows only.

create or replace function public.mark_all_read() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz;
  v_added int;
begin
  v_now := now();

  loop
    insert into public.message_reads (message_id, user_id, read_at)
    select m.id, cm.user_id, v_now
    from public.cluster_members cm
    join public.messages m on m.cluster_id = cm.cluster_id
    where cm.user_id = auth.uid()
      and cm.left_at is null
      and m.deleted_at is null
      and m.author_id <> cm.user_id
      and m.created_at > cm.last_read_message_at
      and m.created_at <= v_now
      and not exists (
        select 1 from public.message_reads r
        where r.message_id = m.id and r.user_id = cm.user_id
      )
    order by m.created_at, m.id
    limit 2000
    on conflict (message_id, user_id) do nothing;
    get diagnostics v_added = row_count;
    exit when v_added < 2000;
  end loop;

  update public.notifications
  set read_at = v_now
  where user_id = auth.uid() and read_at is null;

  update public.cluster_members
  set last_read_message_at = v_now
  where user_id = auth.uid() and left_at is null;
end; $$;

create or replace function public.clear_all_notifications() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz;
  v_added int;
begin
  v_now := now();

  loop
    insert into public.message_reads (message_id, user_id, read_at)
    select m.id, cm.user_id, v_now
    from public.cluster_members cm
    join public.messages m on m.cluster_id = cm.cluster_id
    where cm.user_id = auth.uid()
      and cm.left_at is null
      and m.deleted_at is null
      and m.author_id <> cm.user_id
      and m.created_at > cm.last_read_message_at
      and m.created_at <= v_now
      and not exists (
        select 1 from public.message_reads r
        where r.message_id = m.id and r.user_id = cm.user_id
      )
    order by m.created_at, m.id
    limit 2000
    on conflict (message_id, user_id) do nothing;
    get diagnostics v_added = row_count;
    exit when v_added < 2000;
  end loop;

  delete from public.notifications
  where user_id = auth.uid();

  update public.cluster_members
  set last_read_message_at = v_now
  where user_id = auth.uid() and left_at is null;
end; $$;

grant execute on function public.mark_all_read() to authenticated;
grant execute on function public.clear_all_notifications() to authenticated;

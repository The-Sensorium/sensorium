-- 0154_read_receipt_batch_cap.sql
-- Scale hardening S-11 (batch cap) + S-12 (outbox retry indexes).
--
--   1. mark_cluster_read / mark_all_read froze read receipts with one
--      unbounded INSERT ... SELECT. A long-absent member opening a busy room
--      inserts thousands of message_reads rows in a single statement, inside
--      a txn that also advances the watermark. Both functions now freeze in
--      bounded batches of 2000 (deterministic oldest-first order), looping
--      until no uncovered message remains. Same rows, same read_at instant,
--      same watermark advance: receipt semantics are unchanged, each
--      statement's work is bounded. The frontend throttle (RoomView, 5s +
--      visibility flush) cuts how often these run during bursts.
--   2. The outbox claim predicates re-offer (failed AND attempts < 5) rows,
--      but the queue indexes only cover ('queued', 'sending'), so retries
--      seq-scan once anything is unhealthy. Partial retry indexes cover both
--      claimable statuses; the claim functions are untouched.

-- -- 1) Batched read-receipt freezing ------------------------------------------

create or replace function public.mark_cluster_read(p_cluster_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev timestamptz;
  v_now timestamptz;
  v_added int;
begin
  select last_read_message_at into v_prev
  from public.cluster_members
  where cluster_id = p_cluster_id
    and user_id = auth.uid()
    and left_at is null;
  if v_prev is null then return; end if;

  v_now := now();

  loop
    insert into public.message_reads (message_id, user_id, read_at)
    select m.id, auth.uid(), v_now
    from public.messages m
    where m.cluster_id = p_cluster_id
      and m.deleted_at is null
      and m.author_id <> auth.uid()
      and m.created_at > v_prev
      and m.created_at <= v_now
      and not exists (
        select 1 from public.message_reads r
        where r.message_id = m.id and r.user_id = auth.uid()
      )
    order by m.created_at, m.id
    limit 2000
    on conflict (message_id, user_id) do nothing;
    get diagnostics v_added = row_count;
    exit when v_added < 2000;
  end loop;

  update public.cluster_members
  set last_read_message_at = v_now
  where cluster_id = p_cluster_id
    and user_id = auth.uid()
    and left_at is null;
end; $$;

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

  delete from public.notifications
  where user_id = auth.uid();

  update public.cluster_members
  set last_read_message_at = v_now
  where user_id = auth.uid() and left_at is null;
end; $$;

grant execute on function public.mark_cluster_read(uuid) to authenticated;
grant execute on function public.mark_all_read() to authenticated;

-- -- 2) Outbox retry indexes ----------------------------------------------------
-- Claim predicates (0068/0100, retry limbs in 0101) match 'queued' rows plus
-- 'failed' rows below the attempt limit. The existing queue indexes exclude
-- 'failed', so these partial indexes keep the retry path indexed.

create index if not exists outbound_emails_retry_idx
  on public.outbound_emails (status, attempts, created_at)
  where status in ('queued', 'failed');

create index if not exists push_outbox_retry_idx
  on public.push_outbox (status, attempts, created_at)
  where status in ('queued', 'failed');

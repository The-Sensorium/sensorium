-- 0049_message_reads.sql
-- Freeze per-message read timestamps. Previously the "Seen by" list displayed a
-- member's *current* cluster_members.last_read_message_at watermark as the read
-- time, but that watermark is a cursor advanced to now() by every debounced
-- mark_cluster_read call. A member pinned in an open room kept re-rendering the
-- receipts with a read time that marched toward the current clock (see 0048).
--
-- Now each (message, member) pair gets one immutable read_at row the first time
-- the member's watermark passes the message. Receipts read from message_reads,
-- so a read time is fixed forever. The watermark itself is unchanged and still
-- drives unread counts / mark-* advances.
--
--   1. message_reads (message_id, user_id, read_at), PK on the pair.
--   2. mark_cluster_read / mark_all_read insert rows for newly covered messages
--      before advancing the watermark (same transaction, read_at = now()).
--   3. get_message_reads exposes readers of one message to its active members,
--      guarded like get_member_profiles. Every mark_cluster_read also advances
--      the watermark, so the existing cluster_members UPDATE realtime handler
--      refreshes an open receipt dialog; message_reads itself is not published.
--   4. Backfill existing history: members who already caught up are recorded as
--      readers, with the watermark as a frozen approximation of when they read
--      each message. Messages that predate a member's join are left unseen (a
--      member never actually read history sent before they joined). Bounded by
--      member-message pairs read so far.

create table public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_reads enable row level security;

-- Receipts are readable by any active member of the message's cluster (the same
-- guard get_member_profiles enforces), so a direct table read stays members-only.
create policy message_reads_cluster_member_select
  on public.message_reads for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      join public.cluster_members cm on cm.cluster_id = m.cluster_id
      where m.id = message_id
        and cm.user_id = auth.uid()
        and cm.left_at is null
    )
  );

-- Writes happen exclusively inside the security-definer mark_cluster_read /
-- mark_all_read, which bypass RLS. There is intentionally no insert policy, so a
-- REST client cannot fabricate a read row or timestamp for a message they have
-- not read.

create or replace function public.mark_cluster_read(p_cluster_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev timestamptz;
  v_now timestamptz;
begin
  select last_read_message_at into v_prev
  from public.cluster_members
  where cluster_id = p_cluster_id
    and user_id = auth.uid()
    and left_at is null;
  if v_prev is null then return; end if;

  v_now := now();

  insert into public.message_reads (message_id, user_id, read_at)
  select m.id, auth.uid(), v_now
  from public.messages m
  where m.cluster_id = p_cluster_id
    and m.deleted_at is null
    and m.author_id <> auth.uid()
    and m.created_at > v_prev
    and m.created_at <= v_now
  on conflict (message_id, user_id) do nothing;

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
begin
  v_now := now();

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
  on conflict (message_id, user_id) do nothing;

  update public.notifications
  set read_at = v_now
  where user_id = auth.uid() and read_at is null;

  update public.cluster_members
  set last_read_message_at = v_now
  where user_id = auth.uid() and left_at is null;
end; $$;

-- Backfill: members who already caught up are recorded as readers, with the
-- watermark as a frozen approximation of when they read each message. Lower
-- bound is the join time: a member has only ever "read" messages sent after
-- they joined (mark_cluster_read applies the same bound via the watermark,
-- which starts at join time). Messages that predate a member's join stay unseen.
insert into public.message_reads (message_id, user_id, read_at)
select m.id, cm.user_id, cm.last_read_message_at
from public.cluster_members cm
join public.messages m on m.cluster_id = cm.cluster_id
where cm.left_at is null
  and m.deleted_at is null
  and m.author_id <> cm.user_id
  and m.created_at > cm.joined_at
  and m.created_at <= cm.last_read_message_at
on conflict (message_id, user_id) do nothing;

create function public.get_message_reads(p_message_id uuid)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  read_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.display_name,
    case
      when c.introductions_completed_at is not null then p.avatar_url else null
    end,
    r.read_at
  from public.message_reads r
  join public.profiles p on p.id = r.user_id
  join public.messages m on m.id = r.message_id
  join public.clusters c on c.id = m.cluster_id
  join public.cluster_members cm
    on cm.cluster_id = m.cluster_id and cm.user_id = r.user_id
  where r.message_id = p_message_id
    and cm.left_at is null
    and exists (
      select 1
      from public.cluster_members me
      where me.cluster_id = m.cluster_id
        and me.user_id = auth.uid()
        and me.left_at is null
    )
  order by r.read_at desc;
$$;

grant execute on function public.get_message_reads(uuid) to authenticated;

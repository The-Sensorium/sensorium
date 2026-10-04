-- 0171_meetups_schema.sql
-- Cluster Meetup weekly group-call flow: schema only (RPCs in 0172, realtime and
-- cron in 0173). One active meetup per cluster is enforced in the RPC layer via
-- advisory lock, mirroring start_call. Clients have SELECT through the member
-- policies below; all writes go through security definer functions.

create type public.meetup_status as enum (
  'proposed',
  'voting',
  'confirmed',
  'starting',
  'active',
  'completed',
  'cancelled'
);

-- Notification types used by the meetup lifecycle. Added here so 0172
-- functions can reference them. Follows the 0072 add-value pattern.
alter type public.notification_type add value if not exists 'meetup_invite';
alter type public.notification_type add value if not exists 'meetup_confirmed';
alter type public.notification_type add value if not exists 'meetup_reminder_24h';
alter type public.notification_type add value if not exists 'meetup_reminder_15m';
alter type public.notification_type add value if not exists 'meetup_starting';

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  status public.meetup_status not null default 'voting',
  confirmed_slot_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  voting_closes_at timestamptz not null,
  reminder_24h_sent_at timestamptz,
  reminder_15m_sent_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  call_id uuid references public.calls(id) on delete set null,
  week_label text,
  created_at timestamptz not null default now(),
  constraint meetup_window_valid check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  ),
  constraint meetup_terminal_timestamp check (
    (status <> 'cancelled' or cancelled_at is not null)
    and (status <> 'completed' or completed_at is not null)
  )
);

create index meetups_cluster_status_idx
  on public.meetups (cluster_id, status, created_at desc);
create index meetups_reminder_idx
  on public.meetups (status, starts_at)
  where (status in ('confirmed', 'starting'));
create index meetups_expiry_idx
  on public.meetups (status, voting_closes_at, ends_at)
  where (status in ('voting', 'confirmed', 'starting', 'active'));

create table public.meetup_slots (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint slot_window_valid check (ends_at > starts_at)
);

create index meetup_slots_meetup_idx
  on public.meetup_slots (meetup_id, starts_at);

create table public.meetup_votes (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  slot_id uuid not null references public.meetup_slots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create index meetup_votes_slot_idx
  on public.meetup_votes (slot_id);

create table public.meetup_rsvps (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'going' check (status in ('going', 'maybe', 'declined')),
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create table public.meetup_feedback (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating text not null check (rating in ('loved', 'nice', 'not_for_me')),
  meet_again text check (meet_again in ('yes', 'maybe')),
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

alter table public.meetups enable row level security;
alter table public.meetup_slots enable row level security;
alter table public.meetup_votes enable row level security;
alter table public.meetup_rsvps enable row level security;
alter table public.meetup_feedback enable row level security;

create policy "meetups read members"
  on public.meetups for select
  using (public.is_active_member(cluster_id));

create policy "meetup slots read members"
  on public.meetup_slots for select
  using (
    public.is_active_member(
      (select cluster_id from public.meetups where id = meetup_id)
    )
  );

create policy "meetup votes read members"
  on public.meetup_votes for select
  using (
    public.is_active_member(
      (select cluster_id from public.meetups where id = meetup_id)
    )
  );

create policy "meetup rsvps read members"
  on public.meetup_rsvps for select
  using (
    public.is_active_member(
      (select cluster_id from public.meetups where id = meetup_id)
    )
  );

create policy "meetup feedback read members"
  on public.meetup_feedback for select
  using (
    public.is_active_member(
      (select cluster_id from public.meetups where id = meetup_id)
    )
  );

revoke all on table public.meetups from anon;
revoke all on table public.meetup_slots from anon;
revoke all on table public.meetup_votes from anon;
revoke all on table public.meetup_rsvps from anon;
revoke all on table public.meetup_feedback from anon;
grant select on table public.meetups to authenticated;
grant select on table public.meetup_slots to authenticated;
grant select on table public.meetup_votes to authenticated;
grant select on table public.meetup_rsvps to authenticated;
grant select on table public.meetup_feedback to authenticated;

-- 0107_cluster_calls.sql
-- Call state for cluster calls (LiveKit carries the media; Postgres is the
-- signal/state plane). One live call at a time per cluster; being on the call
-- is a distinct state from being online in the room, so ringing/active/ended
-- plus an explicit participant row drive the UI. Frontend writes only via the
-- RPCs in 0108; clients get SELECT through the member policies below.

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  initiated_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'ringing' check (status in ('ringing', 'active', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint ended_has_timestamp check (status <> 'ended' or ended_at is not null)
);

create index calls_live_cluster_idx
  on public.calls (cluster_id, created_at)
  where (status in ('ringing', 'active'));

create table public.call_participants (
  call_id uuid not null references public.calls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (call_id, user_id)
);

create index call_participants_call_idx
  on public.call_participants (call_id)
  where (left_at is null);

alter table public.calls enable row level security;
alter table public.call_participants enable row level security;

create policy "calls read members"
  on public.calls for select
  using (public.is_active_member(cluster_id));

create policy "call participants read members"
  on public.call_participants for select
  using (
    public.is_active_member(
      (select cluster_id from public.calls where id = call_id)
    )
  );

revoke all on table public.calls from anon;
revoke all on table public.call_participants from anon;
grant select on table public.calls to authenticated;
grant select on table public.call_participants to authenticated;

-- Stream call events to the cluster channel so members see ringing and
-- status changes without polling. After this migration, restart the local
-- stack (`supabase stop && supabase start`) for realtime to pick up the tables.

alter publication supabase_realtime add table
  public.calls,
  public.call_participants;

insert into realtime.subscription (subscription_id, entity, claims)
select gen_random_uuid(), t.e::regclass, jsonb_build_object('role', 'authenticated')
from unnest(array[
  'calls',
  'call_participants'
]) as t(e);

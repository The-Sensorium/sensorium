-- 007_votes_replacement.sql

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  type public.vote_type not null,
  initiated_by uuid not null references public.profiles(id),
  target_member_id uuid references public.profiles(id),   -- replace_member only
  name_suggestion text,                                    -- change_name only
  status public.vote_status not null default 'open',
  closes_at timestamptz not null default now() + interval '48 hours',
  result jsonb,                                            -- outcome summary
  created_at timestamptz not null default now()
);

create index votes_open_idx on public.votes (cluster_id, status, closes_at);

create table public.vote_responses (
  vote_id uuid not null references public.votes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  choice text not null,        -- 'yes' | 'no' | candidate user_id
  created_at timestamptz not null default now(),
  primary key (vote_id, user_id)
);

create table public.replacement_rounds (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  mode public.matching_mode not null,
  status public.replacement_status not null default 'selecting_candidates',
  candidate_pool uuid[],                    -- current pool (up to 3), ordered by preference
  invited_user_id uuid,
  select_candidate_vote_id uuid references public.votes(id),
  declined_user_ids uuid[] not null default '{}',  -- candidates who refused/expired; excluded from future pools
  attempts int not null default 0,          -- pool sourcing attempts; >=5 with no result closes the round
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.invitation_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '72 hours',
  responded_at timestamptz
);

alter table public.votes enable row level security;
alter table public.vote_responses enable row level security;
alter table public.replacement_rounds enable row level security;
alter table public.invitations enable row level security;

-- open vote: members see existence but NOT results (hidden until closed)
create policy "votes read members"
  on public.votes for select
  using (public.is_active_member(cluster_id));

create policy "vote responses members manage"
  on public.vote_responses for select
  using (public.is_active_member((select cluster_id from public.votes where id = vote_id)));
create policy "vote responses insert"
  on public.vote_responses for insert
  with check (public.is_active_member((select cluster_id from public.votes where id = vote_id)));
create policy "vote responses delete own"
  on public.vote_responses for delete
  using (auth.uid() = user_id);

create policy "replacement rounds read members"
  on public.replacement_rounds for select
  using (public.is_active_member(cluster_id));

create policy "invitations self read"
  on public.invitations for select using (auth.uid() = user_id);
create policy "invitations self update"
  on public.invitations for update using (auth.uid() = user_id);

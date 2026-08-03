-- 003_queues_clusters.sql

create table public.queue_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode public.matching_mode not null,
  queue_key text not null,
  joined_at timestamptz not null default now(),
  constraint one_queue_per_mode unique (user_id, mode, queue_key)
);

create unique index queue_entries_local_one
  on public.queue_entries (user_id) where (mode = 'local');

create index queue_entries_ready_idx
  on public.queue_entries (mode, queue_key, joined_at);

create table public.clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  matching_mode public.matching_mode not null,
  mode_label text not null,
  queue_key text not null,
  status public.cluster_status not null default 'introductions',
  introductions_deadline timestamptz,
  introductions_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cluster_members (
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  intro_completed_at timestamptz,
  primary key (cluster_id, user_id)
);

create index cluster_members_user_idx
  on public.cluster_members (user_id) where (left_at is null);

create table public.mode_cooldowns (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode public.matching_mode not null,
  available_at timestamptz not null,
  primary key (user_id, mode)
);

create table public.intro_questions (
  id smallint primary key,
  prompt text not null,
  position smallint not null
);

create table public.intro_answers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  question_id smallint not null references public.intro_questions(id),
  answer text not null check (char_length(answer) <= 1000),
  created_at timestamptz not null default now(),
  primary key (user_id, cluster_id, question_id)
);

alter table public.queue_entries enable row level security;
alter table public.clusters enable row level security;
alter table public.cluster_members enable row level security;
alter table public.mode_cooldowns enable row level security;
alter table public.intro_questions enable row level security;
alter table public.intro_answers enable row level security;

create policy "queue self read"
  on public.queue_entries for select using (auth.uid() = user_id);
create policy "queue self insert"
  on public.queue_entries for insert with check (auth.uid() = user_id);
create policy "queue self delete"
  on public.queue_entries for delete using (auth.uid() = user_id);

create function public.is_active_member(p_cluster_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cluster_members cm
    where cm.cluster_id = p_cluster_id
      and cm.user_id = auth.uid()
      and cm.left_at is null
  );
$$;

create policy "cluster read members"
  on public.clusters for select using (public.is_active_member(id));

create policy "members read own cluster"
  on public.cluster_members for select
  using (public.is_active_member(cluster_id));

create policy "cooldown self read"
  on public.mode_cooldowns for select using (auth.uid() = user_id);

create policy "intro questions read"
  on public.intro_questions for select to authenticated using (true);

create policy "intro answers read"
  on public.intro_answers for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.clusters c
      join public.cluster_members cm on cm.cluster_id = c.id
      where c.id = intro_answers.cluster_id
        and cm.user_id = auth.uid() and cm.left_at is null
        and c.introductions_completed_at is not null
    )
  );

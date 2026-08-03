-- 005_signals.sql

create table public.signals (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 300),
  status public.signal_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

create index signals_cluster_idx on public.signals (cluster_id, status, created_at desc);

create table public.signal_replies (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.signals(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.signals enable row level security;
alter table public.signal_replies enable row level security;

create policy "signals read own cluster"
  on public.signals for select
  using (public.is_active_member(cluster_id));
create policy "signals insert own cluster"
  on public.signals for insert
  with check (public.is_active_member(cluster_id) and auth.uid() = author_id);
create policy "signals update raiser only"
  on public.signals for update
  using (auth.uid() = author_id);

create policy "signal replies read own cluster"
  on public.signal_replies for select
  using (
    public.is_active_member(
      (select cluster_id from public.signals where id = signal_id)
    )
  );
create policy "signal replies insert own cluster"
  on public.signal_replies for insert
  with check (auth.uid() = author_id);

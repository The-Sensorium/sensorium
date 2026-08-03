-- 008_notifications.sql

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  cluster_id uuid references public.clusters(id) on delete cascade,
  title text not null,
  body text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table public.notification_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  messages boolean not null default true,
  mentions boolean not null default true,
  reactions boolean not null default true,
  votes boolean not null default true,
  invitations boolean not null default true,
  signals boolean not null default true,
  primary key (user_id, cluster_id)
);

alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;

create policy "notifications self"
  on public.notifications for select using (auth.uid() = user_id);
create policy "notifications self update"
  on public.notifications for update using (auth.uid() = user_id);

create policy "prefs self"
  on public.notification_prefs for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

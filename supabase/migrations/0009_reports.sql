-- 009_reports.sql

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid references public.clusters(id),
  reporter_id uuid not null references public.profiles(id),
  target_user_id uuid not null references public.profiles(id),
  reason public.report_reason not null,
  details text,
  status public.report_status not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "reports insert self"
  on public.reports for insert
  with check (auth.uid() = reporter_id);
create policy "reports read own"
  on public.reports for select using (auth.uid() = reporter_id);

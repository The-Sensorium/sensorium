-- 004_chat.sql

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  image_url text,
  reply_to_id uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint has_content check (content is not null or image_url is not null)
);

create index messages_cluster_idx on public.messages (cluster_id, created_at);

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;

create function public.cluster_unlocked(p_cluster_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clusters c
    where c.id = p_cluster_id and c.introductions_completed_at is not null
  );
$$;

create policy "messages read unlocked cluster"
  on public.messages for select
  using (public.is_active_member(cluster_id) and public.cluster_unlocked(cluster_id));

create policy "messages insert unlocked cluster"
  on public.messages for insert
  with check (
    public.is_active_member(cluster_id)
    and public.cluster_unlocked(cluster_id)
    and auth.uid() = author_id
  );

create policy "messages author update"
  on public.messages for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "reactions read"
  on public.message_reactions for select
  using (
    public.is_active_member(
      (select cluster_id from public.messages where id = message_id)
    )
  );

create policy "reactions manage own"
  on public.message_reactions for insert
  with check (auth.uid() = user_id);

create policy "reactions delete own"
  on public.message_reactions for delete using (auth.uid() = user_id);

create function public.get_member_profiles(p_cluster_id uuid)
returns table (
  id uuid,
  display_name text,
  country_code text,
  birth_year smallint,
  current_status text,
  availability public.availability,
  avatar_url text,
  bio text,
  onboarding_completed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.display_name,
    p.country_code,
    p.birth_year,
    p.current_status,
    p.availability,
    case
      when c.introductions_completed_at is not null then p.avatar_url else null
    end,
    case
      when c.introductions_completed_at is not null then p.bio else null
    end,
    p.onboarding_completed_at
  from public.profiles p
  join public.cluster_members cm on cm.user_id = p.id
  join public.clusters c on c.id = cm.cluster_id
  where cm.cluster_id = p_cluster_id
    and cm.left_at is null
    and exists (
      select 1 from public.cluster_members me
      where me.cluster_id = p_cluster_id
        and me.user_id = auth.uid()
        and me.left_at is null
    );
$$;

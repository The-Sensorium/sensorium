-- 002_profiles.sql

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default 'New Member',
  dob date,
  country_code text,
  bio text check (char_length(bio) <= 500),
  avatar_url text,
  latitude double precision,
  longitude double precision,
  local_area text,
  local_radius_km integer,
  current_status text check (char_length(current_status) <= 60),
  availability public.availability not null default 'available',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dob_18_or_null check (dob is null or dob <= current_date - interval '18 years')
);

alter table public.profiles
  add column birth_year smallint generated always as (extract(year from dob)::smallint) stored;
alter table public.profiles
  add column birth_month smallint generated always as (extract(month from dob)::smallint) stored;
alter table public.profiles
  add column birth_day smallint generated always as (extract(day from dob)::smallint) stored;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.protect_dob() returns trigger
language plpgsql as $$
begin
  if new.dob is distinct from old.dob and old.dob is not null then
    raise exception 'date of birth cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end; $$;

create trigger profiles_protect_dob
  before update on public.profiles
  for each row execute function public.protect_dob();

create index profiles_country_idx on public.profiles (country_code);

alter table public.profiles enable row level security;

create policy "profiles self read"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles self update"
  on public.profiles for update using (auth.uid() = id);

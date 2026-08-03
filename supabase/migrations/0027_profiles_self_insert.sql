-- 0027_profiles_self_insert.sql
-- Allow a signed-in user to bootstrap their own profile row if it is missing
-- (e.g. account created before the profile trigger existed on auth.users).

create policy "profiles self insert"
  on public.profiles for insert
  with check (auth.uid() = id);
-- 0029_profiles_self_insert_grant.sql
-- Completes 0027: the self-insert RLS policy was added there, but the
-- `authenticated` role still lacks the underlying INSERT privilege. Without
-- the grant, onboarding's profile upsert (`INSERT ... ON CONFLICT DO UPDATE`)
-- fails with `permission denied for table profiles`.

grant insert on public.profiles to authenticated;

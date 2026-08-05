-- 0040 - Drop the mood feature (table, RPC, enum).
-- The mood feature was removed app-wide; drop the objects that earlier
-- migrations (0006, 0012, 0001) created. Works for both fresh databases
-- (where 0006 recreated the table and this removes it) and existing
-- databases that already had the feature. Idempotent via db reset.
drop table if exists public.moods;
drop function if exists public.set_mood;
drop type if exists public.mood;

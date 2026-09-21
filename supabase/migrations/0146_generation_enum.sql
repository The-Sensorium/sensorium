-- 0146 - Generation matching mode (enum only; kept separate so the new label
-- is committed before any function body references it).
alter type public.matching_mode add value if not exists 'generation';

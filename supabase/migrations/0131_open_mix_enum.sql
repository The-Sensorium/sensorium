-- 0131 - Open Mix matching mode (enum only).
-- Kept separate from 0132 so the new label is committed before any function
-- body references it. Never edit an applied migration; this only adds.
alter type public.matching_mode add value if not exists 'open_mix';

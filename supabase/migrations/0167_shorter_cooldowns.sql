-- 0167 - Shorter per-mode cooldowns.
-- Date-based modes drop from 30 days to 7 days, open_mix drops from 7 days to
-- 3 days, and local drops from 30 days to 3 days. Beta feedback flagged the
-- 30-day lockout as feeling stuck, and per-mode isolation already limits
-- hopping abuse. All writers (leave_cluster, vote close, moderation) read
-- fn_cooldown_interval, so one function change covers every path.

create or replace function public.fn_cooldown_interval(p_mode public.matching_mode)
returns interval
language sql immutable as $$
  select case p_mode
    when 'open_mix' then interval '3 days'
    when 'local' then interval '3 days'
    else interval '7 days'
  end;
$$;

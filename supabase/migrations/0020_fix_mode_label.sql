-- 0020 — Fix fn_mode_label month padding.
--
-- `to_char(..., 'Month')` pads the month name to 9 characters, producing labels
-- like "April     16, 1995". `FMMonth` removes the padding. Applied on top of
-- 0011 so existing databases get the fix without a reset.

create or replace function public.fn_mode_label(p_mode matching_mode, p_key text) returns text
language sql
immutable
set search_path = public
as $function$
  select case p_mode
    when 'exact_birthdate' then to_char(to_date(p_key, 'YYYY-MM-DD'), 'FMMonth DD, YYYY')
    when 'birth_year_month' then replace(to_char(to_date(p_key || '-01', 'YYYY-MM'), 'FMMonth'), ' ', '') || ' ' || split_part(p_key, '-', 1)
    when 'birth_month' then to_char(to_date(p_key || '/01', 'MM/DD'), 'FMMonth')
    when 'birth_year' then p_key
    when 'local' then 'Within ' || split_part(p_key, ':', 3) || 'km of ' || replace(split_part(p_key, ':', 2), '-', ' ')
  end;
$function$;

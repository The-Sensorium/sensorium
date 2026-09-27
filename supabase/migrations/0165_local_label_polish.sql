-- 0165_local_label_polish.sql
-- Humanize the Local mode label: 'Within 10km of thiruvananthapuram' becomes
-- 'Within 10 km of Thiruvananthapuram'. Queue keys are untouched (only the
-- label), so existing queues keep matching. Rows already stored (clusters.name,
-- clusters.mode_label) keep their old text; live status labels pick this up.
-- Live body is 0147 (fn_mode_label); all other branches copied verbatim.

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
    when 'generation' then 'Born ' || p_key
    when 'local' then 'Within ' || split_part(p_key, ':', 3) || ' km of ' || initcap(replace(split_part(p_key, ':', 2), '-', ' '))
    when 'open_mix' then 'Open Mix'
  end;
$function$;

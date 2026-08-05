-- 0039_cron_idempotent.sql
-- cron.schedule(name, ...) creates a new job row on every call; re-applying
-- 0015 (e.g. on staging/prod) would stack duplicate jobs for the same name.
-- Unschedule by name first (guarded so a missing job is a no-op), then
-- re-declare. Net effect: each named job exists exactly once.

select cron.unschedule('intro-deadline')
where exists (select 1 from cron.job where jobname = 'intro-deadline');
select cron.schedule('intro-deadline',       '*/15 * * * *', $$select public.check_intro_deadlines()$$);

select cron.unschedule('vote-close')
where exists (select 1 from cron.job where jobname = 'vote-close');
select cron.schedule('vote-close',           '*/10 * * * *', $$select public.close_expired_votes()$$);

select cron.unschedule('invite-expire')
where exists (select 1 from cron.job where jobname = 'invite-expire');
select cron.schedule('invite-expire',        '*/30 * * * *', $$select public.expire_invitations()$$);

select cron.unschedule('replacement-progress')
where exists (select 1 from cron.job where jobname = 'replacement-progress');
select cron.schedule('replacement-progress', '*/60 * * * *', $$select public.progress_replacements()$$);

-- 015_cron.sql

create extension if not exists pg_cron;

select cron.schedule('intro-deadline',        '*/15 * * * *', $$select public.check_intro_deadlines()$$);
select cron.schedule('vote-close',            '*/10 * * * *', $$select public.close_expired_votes()$$);
select cron.schedule('invite-expire',         '*/30 * * * *', $$select public.expire_invitations()$$);
select cron.schedule('replacement-progress',  '*/60 * * * *', $$select public.progress_replacements()$$);

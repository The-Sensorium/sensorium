-- 0017 — Base table privileges for the `authenticated` role.
--
-- Row-level access stays enforced by the RLS policies defined in 0002–0009;
-- these grants only make the tables reachable through PostgREST (newer local
-- postgres images no longer grant DML to `authenticated` by default). The
-- `anon` role gets no DML on app tables; RPC functions run `security definer`
-- and need no grants.

grant select, update on public.profiles to authenticated;

grant select, insert, delete on public.queue_entries to authenticated;

grant select on public.intro_questions to authenticated;
grant select on public.intro_answers to authenticated;

grant select, insert, update on public.messages to authenticated;
grant select, insert, delete on public.message_reactions to authenticated;

grant select, insert, update on public.signals to authenticated;
grant select, insert on public.signal_replies to authenticated;

grant select, insert on public.moods to authenticated;

grant select on public.votes to authenticated;
grant select, insert, delete on public.vote_responses to authenticated;

grant select on public.replacement_rounds to authenticated;

grant select, update on public.invitations to authenticated;

grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.notification_prefs to authenticated;

grant select on public.clusters to authenticated;
grant select on public.cluster_members to authenticated;
grant select on public.mode_cooldowns to authenticated;

grant select, insert on public.reports to authenticated;

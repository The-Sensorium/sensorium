-- 0181_meetup_pref_toggle.sql
-- Dedicated Meetups notification preference. Meetup pushes rode on the votes
-- preference as a v1 shortcut, so muting governance silently killed
-- time-critical meetup reminders. Existing rows inherit their votes value so
-- nobody's effective behavior changes; new rows default to on.

alter table public.notification_prefs
  add column meetups boolean;

update public.notification_prefs
set meetups = votes
where meetups is null;

alter table public.notification_prefs
  alter column meetups set not null,
  alter column meetups set default true;

create or replace function public.notification_allowed(
  p_pref public.notification_prefs,
  p_type public.notification_type,
  p_cluster_id uuid
) returns boolean
language sql stable as $$
  select case
    when p_cluster_id is null then true
    when p_pref is null then true
    when p_type = 'message' then p_pref.messages
    when p_type = 'mention' then p_pref.mentions
    when p_type = 'reaction' then p_pref.reactions
    when p_type in ('vote_started', 'vote_result', 'replacement') then p_pref.votes
    when p_type in ('meetup_invite', 'meetup_confirmed', 'meetup_reminder_24h', 'meetup_reminder_15m', 'meetup_starting') then p_pref.meetups
    when p_type = 'invitation_received' then p_pref.invitations
    when p_type = 'signal_new' then p_pref.signals
    when p_type = 'post_comment' then p_pref.post_comment
    when p_type = 'post_like' then p_pref.post_like
    when p_type = 'moderation_notice' then true
    else true
  end;
$$;

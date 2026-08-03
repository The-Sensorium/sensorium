-- 001_enums.sql

create type public.matching_mode as enum (
  'exact_birthdate',
  'birth_year_month',
  'birth_month',
  'birth_year',
  'local'
);

create type public.cluster_status as enum ('introductions', 'active', 'archived');

create type public.signal_status as enum ('open', 'in_progress', 'resolved');

create type public.mood as enum ('great', 'good', 'okay', 'low', 'stressed');

create type public.availability as enum ('available', 'busy', 'dnd');

create type public.vote_type as enum ('replace_member', 'change_name', 'select_candidate');

create type public.vote_status as enum ('open', 'closed');

create type public.replacement_status as enum (
  'selecting_candidates',
  'voting',
  'inviting',
  'filled',
  'closed'
);

create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'expired');

create type public.notification_type as enum (
  'message',
  'mention',
  'reaction',
  'vote_started',
  'vote_result',
  'cluster_formed',
  'invitation_received',
  'signal_new',
  'replacement',
  'unlocked',
  'queue_update'
);

create type public.report_reason as enum (
  'harassment',
  'hate_speech',
  'spam',
  'inappropriate_content',
  'other'
);

create type public.report_status as enum ('pending', 'reviewing', 'actioned', 'dismissed');

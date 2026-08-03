-- 0025 - Hardening: image moderation, member reporting, delete account
-- Milestone 12 (Hardening & Launch). Follows 0024. Idempotent via db reset.
--
--   1. Chat images carry a `moderation_status` (pending/approved/rejected).
--      Default 'approved' keeps the MVP flow (uploads are validated client-side
--      by type/size); a moderator or service job flips a row to 'rejected'
--      (or 'pending' for review) and the chat UI hides anything that is not
--      'approved' (the "NSFW moderation state hides unapproved images" check).
--   2. `report_member` - validated member-report write (PRD: users may report
--      other members; reasons: harassment, hate_speech, spam,
--      inappropriate_content, other). Rejects self-reports and non-members.
--   3. `delete_my_account` - self-service account deletion. Runs as the table
--      owner (postgres) so it can remove the `auth.users` row; `profiles` and
--      every owned table cascade (memberships, messages, moods, reactions,
--      signals, notifications, prefs, votes, queue entries, ...).

-- -- 1) Image moderation -----------------------------------------------------

create type public.image_moderation_status as enum ('pending', 'approved', 'rejected');

alter table public.messages
  add column moderation_status public.image_moderation_status not null default 'approved';

-- -- 2) Report a member ------------------------------------------------------

create function public.report_member(
  p_cluster_id uuid,
  p_target_user_id uuid,
  p_reason public.report_reason,
  p_details text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reporter_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_reporter_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_reporter_id = p_target_user_id then
    raise exception 'cannot_report_self';
  end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = v_reporter_id
  ) then
    raise exception 'not_a_member';
  end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = p_target_user_id
  ) then
    raise exception 'not_a_member';
  end if;

  insert into public.reports (cluster_id, reporter_id, target_user_id, reason, details)
  values (p_cluster_id, v_reporter_id, p_target_user_id, p_reason, p_details)
  returning id into v_report_id;

  return v_report_id;
end;
$$;

-- -- 3) Delete my account ----------------------------------------------------

create function public.delete_my_account()
returns void
language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid();
$$;

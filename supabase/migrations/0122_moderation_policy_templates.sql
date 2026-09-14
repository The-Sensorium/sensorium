-- 0122_moderation_policy_templates.sql
-- Phase 5 of ADMIN_MODERATION_PRODUCTION_PLAN: structured policies. Adds
-- policy categories + action templates (seeded), records a policy code on
-- enforcement audit rows, and accepts an optional (for now) policy code on
-- the warning/restriction RPCs. Requiring the code comes after UI adoption.

-- -- 1) Tables ---------------------------------------------------------------------

create table public.moderation_policy_categories (
  code text primary key check (char_length(code) between 1 and 64),
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 2000),
  default_severity public.moderation_severity not null default 'medium',
  recommended_action text not null check (char_length(recommended_action) between 1 and 500),
  active boolean not null default true,
  sort_order integer not null default 0
);

create table public.moderation_action_templates (
  code text primary key check (char_length(code) between 1 and 64),
  category_code text not null references public.moderation_policy_categories(code),
  title text not null check (char_length(title) between 1 and 120),
  user_notice text not null check (char_length(user_notice) between 1 and 2000),
  internal_guidance text not null check (char_length(internal_guidance) between 1 and 2000),
  sort_order integer not null default 0,
  active boolean not null default true
);

create index moderation_action_templates_category_idx
  on public.moderation_action_templates (category_code, sort_order)
  where active;

alter table public.moderation_policy_categories enable row level security;
alter table public.moderation_action_templates enable row level security;

alter table public.moderation_actions
  add column policy_code text;

grant select, insert, update on public.moderation_policy_categories to service_role;
grant select, insert, update on public.moderation_action_templates to service_role;

-- -- 2) Seed --------------------------------------------------------------------------

insert into public.moderation_policy_categories
  (code, title, description, default_severity, recommended_action, sort_order)
values
  ('harassment', 'Harassment', 'Targeted abuse, threats, or intimidation of a member.', 'high',
   'Warn first; suspend on repeat or severity.', 10),
  ('hate_speech', 'Hate speech', 'Attacks on protected characteristics or identity.', 'high',
   'Suspend; ban on repeat or severity.', 20),
  ('spam', 'Spam', 'Unsolicited promotion, scams, or repetitive flooding.', 'low',
   'Warn first; suspend on repeat.', 30),
  ('inappropriate_content', 'Inappropriate content', 'Sexually explicit, graphic, or otherwise unsuitable content.', 'medium',
   'Hide the content and warn; suspend on repeat.', 40),
  ('other', 'Other', 'Does not fit the categories above; describe carefully.', 'medium',
   'Decide case by case; prefer the lightest effective action.', 50)
on conflict (code) do nothing;

insert into public.moderation_action_templates
  (code, category_code, title, user_notice, internal_guidance, sort_order)
values
  ('harassment_first_warning', 'harassment', 'First warning',
   'Your message violated our harassment policy. Further violations may lead to suspension.',
   'Use for a first, low-severity harassment finding with no priors.', 10),
  ('harassment_repeat_suspension', 'harassment', 'Repeat suspension',
   'Your account is temporarily suspended for repeated harassment.',
   'Use when priors exist or the conduct is severe but not ban-worthy.', 20),
  ('hate_speech_suspension', 'hate_speech', 'Suspension',
   'Your account is temporarily suspended for hate speech.',
   'Default for confirmed hate speech; consider a ban for severity or repeats.', 10),
  ('hate_speech_ban', 'hate_speech', 'Permanent ban',
   'Your account was permanently banned for hate speech.',
   'Reserve for severe or repeated hate speech; bans need admin care.', 20),
  ('spam_first_warning', 'spam', 'First warning',
   'Your post was removed as spam. Please do not post promotional content.',
   'Use for first-time or low-volume spam.', 10),
  ('spam_repeat_suspension', 'spam', 'Repeat suspension',
   'Your account is temporarily suspended for repeated spam.',
   'Use for spam rings, scams, or repeat flooding.', 20),
  ('inappropriate_hide_warn', 'inappropriate_content', 'Hide and warn',
   'Your content was hidden because it is not appropriate for Sensorium.',
   'Default: hide the content, warn the author.', 10),
  ('other_case_by_case', 'other', 'Case-by-case notice',
   'Your content or conduct did not follow our community guidelines.',
   'Only when no category fits; write a precise user-facing reason.', 10)
on conflict (code) do nothing;

-- -- 3) Validation helper -----------------------------------------------------------------

create or replace function public.assert_valid_policy_code(p_policy_code text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_policy_code is null then
    return;
  end if;
  if not exists (
    select 1 from public.moderation_policy_categories
    where code = p_policy_code and active
  ) then
    raise exception 'invalid_policy_code';
  end if;
end; $$;

-- -- 4) Staff policy read model -------------------------------------------------------------------
-- One row per active template with its category context, for the case UI picker.

create or replace function public.list_moderation_policies()
returns table (
  category_code text,
  category_title text,
  default_severity public.moderation_severity,
  recommended_action text,
  template_code text,
  template_title text,
  user_notice text,
  internal_guidance text
)
language sql stable security definer set search_path = public as $$
  select
    c.code, c.title, c.default_severity, c.recommended_action,
    t.code, t.title, t.user_notice, t.internal_guidance
  from public.moderation_policy_categories c
  join public.moderation_action_templates t
    on t.category_code = c.code and t.active
  where c.active and public.can_moderate(auth.uid())
  order by c.sort_order asc, t.sort_order asc;
$$;

-- -- 5) issue_warning + p_policy_code ------------------------------------------------------------------
-- New signature, so drop the old one first (repo rule: no ambiguous overloads).
-- Bodies mirror 0070; only the policy validation + column are new.

drop function public.issue_warning(uuid, text, uuid);

create function public.issue_warning(
  p_user_id uuid,
  p_reason text,
  p_report_id uuid default null,
  p_policy_code text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  perform public.assert_can_moderate();
  if p_user_id = v_actor then raise exception 'cannot_warn_self'; end if;
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;
  perform public.assert_valid_policy_code(p_policy_code);

  if p_report_id is not null then
    perform public.assert_report_actionable(p_report_id, null, p_user_id);
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  insert into public.moderation_actions (actor_id, target_user_id, report_id, action, reason, metadata, policy_code)
  values (v_actor, p_user_id, p_report_id, 'warning_issued', p_reason,
          jsonb_build_object('type', 'warning'), p_policy_code);

  insert into public.notifications (user_id, type, cluster_id, title, body)
  values (p_user_id, 'moderation_notice', null,
          'A warning was issued on your account',
          'Please review the community guidelines to avoid further action.');

  perform public.enqueue_email(
    p_user_id,
    'warning-issued',
    jsonb_build_object(
      'display_name', (select display_name from public.profiles where id = p_user_id)
    )
  );

  if p_report_id is not null then
    perform public.close_report_as_actioned(p_report_id, p_reason, null, p_user_id);
  end if;
end; $$;

-- -- 6) apply_account_restriction + p_policy_code ---------------------------------------------------------
-- Same treatment as issue_warning; body mirrors 0070.

drop function public.apply_account_restriction(uuid, public.account_status, text, timestamptz, uuid);

create function public.apply_account_restriction(
  p_user_id uuid,
  p_status public.account_status,
  p_reason text,
  p_expires_at timestamptz default null,
  p_report_id uuid default null,
  p_policy_code text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_current public.account_status;
  v_cluster record;
  v_leaver_name text;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_user_id = v_actor then raise exception 'cannot_restrict_self'; end if;
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;
  perform public.assert_valid_policy_code(p_policy_code);

  if p_report_id is not null then
    perform public.assert_report_actionable(p_report_id, null, p_user_id);
  end if;

  select status into v_current
  from public.account_restrictions where user_id = p_user_id;
  v_current := coalesce(v_current, 'active');

  -- ---- lift to active ------------------------------------------------------
  if p_status = 'active' then
    if v_current = 'banned' then
      perform public.assert_can_manage_roles();
    else
      perform public.assert_can_moderate();
      if not public.can_manage_roles(v_actor) and exists (
        select 1 from public.user_roles
        where user_id = p_user_id and revoked_at is null
      ) then
        raise exception 'cannot_restrict_staff';
      end if;
    end if;

    if v_current = 'active' then
      raise exception 'restriction_not_active';
    end if;

    update public.account_restrictions
    set status = 'active', expires_at = null,
        lifted_by = v_actor, lifted_at = now()
    where user_id = p_user_id;

    insert into public.moderation_actions (actor_id, target_user_id, action, reason, metadata, policy_code)
    values (v_actor, p_user_id,
            case when v_current = 'banned'
              then 'ban_lifted'::public.moderation_action_type
              else 'suspension_lifted'::public.moderation_action_type
            end,
            p_reason, jsonb_build_object('previous_status', v_current::text), p_policy_code);

    perform public.enqueue_email(
      p_user_id,
      'restriction-lifted',
      jsonb_build_object(
        'display_name', (select display_name from public.profiles where id = p_user_id)
      )
    );
    return;
  end if;

  -- ---- suspension ----------------------------------------------------------
  if p_status = 'suspended' then
    perform public.assert_can_moderate();

    if v_current = 'banned' and not public.can_manage_roles(v_actor) then
      raise exception 'cannot_unban';
    end if;

    if p_expires_at is null then raise exception 'expiry_required'; end if;

    if not public.can_manage_roles(v_actor) and exists (
      select 1 from public.user_roles
      where user_id = p_user_id and revoked_at is null
    ) then
      raise exception 'cannot_restrict_staff';
    end if;

    if not public.can_manage_roles(v_actor) then
      if p_expires_at > now() + interval '7 days' then raise exception 'suspension_too_long'; end if;
    end if;

    insert into public.account_restrictions (user_id, status, expires_at, reason, changed_by, changed_at)
    values (p_user_id, 'suspended', p_expires_at, p_reason, v_actor, now())
    on conflict (user_id)
    do update set status = excluded.status, expires_at = excluded.expires_at,
                  reason = excluded.reason, changed_by = excluded.changed_by,
                  changed_at = excluded.changed_at, lifted_by = null, lifted_at = null;

    insert into public.moderation_actions (actor_id, target_user_id, report_id, action, reason, metadata, policy_code)
    values (v_actor, p_user_id, p_report_id, 'suspension_applied', p_reason,
            jsonb_build_object('expires_at', p_expires_at), p_policy_code);

    insert into public.notifications (user_id, type, cluster_id, title, body)
    values (p_user_id, 'moderation_notice', null,
            'Your account has been temporarily suspended',
            'You will regain access when the restriction ends. If you think this is a mistake, please contact support.');

    perform public.enqueue_email(
      p_user_id,
      'account-suspended',
      jsonb_build_object(
        'display_name', (select display_name from public.profiles where id = p_user_id),
        'expires_at', p_expires_at,
        'appeal_url', public.app_url() || '/appeal'
      )
    );

    if p_report_id is not null then
      perform public.close_report_as_actioned(p_report_id, p_reason, null, p_user_id);
    end if;
    return;
  end if;

  -- ---- permanent ban -------------------------------------------------------
  perform public.assert_can_manage_roles();

  if exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin' and revoked_at is null
  ) and not exists (
    select 1 from public.user_roles
    where role = 'admin' and revoked_at is null and user_id <> p_user_id
  ) then
    raise exception 'last_admin_required';
  end if;

  update public.user_roles
  set revoked_at = now(), revoked_by = v_actor
  where user_id = p_user_id and revoked_at is null;

  select display_name into v_leaver_name from public.profiles where id = p_user_id;

  for v_cluster in
    select distinct cm.cluster_id
    from public.cluster_members cm
    where cm.user_id = p_user_id and cm.left_at is null
  loop
    update public.cluster_members set left_at = now()
    where cluster_id = v_cluster.cluster_id and user_id = p_user_id;

    insert into public.notifications (user_id, type, cluster_id, title, body)
    select cm.user_id, 'replacement', v_cluster.cluster_id,
           coalesce(v_leaver_name, 'A member') || ' left the cluster',
           'A spot just opened - we are finding a new member to fill it.'
    from public.cluster_members cm
    where cm.cluster_id = v_cluster.cluster_id and cm.left_at is null;

    perform public.start_replacement(v_cluster.cluster_id);
  end loop;

  insert into public.account_restrictions (user_id, status, reason, changed_by, changed_at)
  values (p_user_id, 'banned', p_reason, v_actor, now())
  on conflict (user_id)
  do update set status = excluded.status, expires_at = null,
                reason = excluded.reason, changed_by = excluded.changed_by,
                changed_at = excluded.changed_at, lifted_by = null, lifted_at = null;

  insert into public.moderation_actions (actor_id, target_user_id, report_id, action, reason, metadata, policy_code)
  values (v_actor, p_user_id, p_report_id, 'ban_applied', p_reason, '{}'::jsonb, p_policy_code);

  perform public.enqueue_email(
    p_user_id,
    'account-banned',
    jsonb_build_object(
      'display_name', (select display_name from public.profiles where id = p_user_id),
      'appeal_url', public.app_url() || '/appeal'
    )
  );

  if p_report_id is not null then
    perform public.close_report_as_actioned(p_report_id, p_reason, null, p_user_id);
  end if;
end; $$;

-- -- 7) Grants (drops took the old ones) ------------------------------------------------

grant execute on function
  public.assert_valid_policy_code(text),
  public.list_moderation_policies(),
  public.issue_warning(uuid, text, uuid, text),
  public.apply_account_restriction(uuid, public.account_status, text, timestamptz, uuid, text)
  to authenticated;

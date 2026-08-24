-- 0073_posts_functions.sql
-- Post member + moderator RPC functions. Mirrors the `security definer` +
-- `assert_account_can_write()` style of 0054. Follows 0072. Idempotent via db reset.

-- -- 1) Member mutations -----------------------------------------------------

create or replace function public.create_post(
  p_cluster_id uuid,
  p_content text default null,
  p_image_url text default null,
  p_gif_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  if not (public.is_active_member(p_cluster_id) and public.cluster_unlocked(p_cluster_id)) then
    raise exception 'posts_locked';
  end if;
  if p_content is null and p_image_url is null and p_gif_url is null then
    raise exception 'empty_post';
  end if;
  if p_content is not null and (char_length(p_content) < 1 or char_length(p_content) > 2000) then
    raise exception 'content_out_of_range';
  end if;
  if p_image_url is not null and p_gif_url is not null then
    raise exception 'single_media_only';
  end if;

  insert into public.posts (cluster_id, author_id, content, image_url, gif_url)
  values (p_cluster_id, auth.uid(), p_content, p_image_url, p_gif_url)
  returning id into v_id;

  return v_id;
end; $$;

create or replace function public.edit_post(p_post_id uuid, p_content text) returns void
language plpgsql security definer set search_path = public as $$
declare v_updated integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if p_content is null or char_length(p_content) < 1 or char_length(p_content) > 2000 then
    raise exception 'content_out_of_range';
  end if;

  update public.posts
  set content = p_content, edited_at = now()
  where id = p_post_id and author_id = auth.uid() and deleted_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'post_not_editable'; end if;
end; $$;

create or replace function public.delete_post(p_post_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_updated integer;
  v_image text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select image_url into v_image
  from public.posts where id = p_post_id and author_id = auth.uid() and deleted_at is null;

  update public.posts
  set deleted_at = now()
  where id = p_post_id and author_id = auth.uid() and deleted_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'post_not_deletable'; end if;

  if v_image is not null then
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects o
    where o.bucket_id = 'posts-images' and o.name = v_image;
    perform set_config('storage.allow_delete_query', 'false', true);
  end if;
end; $$;

create or replace function public.toggle_post_like(p_post_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_member uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select cluster_id into v_cluster from public.posts where id = p_post_id;
  if v_cluster is null then raise exception 'post_not_found'; end if;
  if not (public.is_active_member(v_cluster) and public.cluster_unlocked(v_cluster)) then
    raise exception 'posts_locked';
  end if;

  select user_id into v_member from public.post_likes
  where post_id = p_post_id and user_id = auth.uid();
  if v_member is null then
    insert into public.post_likes (post_id, user_id) values (p_post_id, auth.uid());
  else
    delete from public.post_likes where post_id = p_post_id and user_id = auth.uid();
  end if;
end; $$;

create or replace function public.create_post_comment(
  p_post_id uuid,
  p_content text default null,
  p_image_url text default null,
  p_gif_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cluster uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select cluster_id into v_cluster from public.posts where id = p_post_id and deleted_at is null;
  if v_cluster is null then raise exception 'post_not_found'; end if;
  if not (public.is_active_member(v_cluster) and public.cluster_unlocked(v_cluster)) then
    raise exception 'posts_locked';
  end if;
  if p_content is null and p_image_url is null and p_gif_url is null then
    raise exception 'empty_comment';
  end if;
  if p_content is not null and (char_length(p_content) < 1 or char_length(p_content) > 1000) then
    raise exception 'content_out_of_range';
  end if;
  if p_image_url is not null and p_gif_url is not null then
    raise exception 'single_media_only';
  end if;

  insert into public.post_comments (post_id, author_id, content, image_url, gif_url)
  values (p_post_id, auth.uid(), p_content, p_image_url, p_gif_url)
  returning id into v_id;

  return v_id;
end; $$;

create or replace function public.delete_post_comment(p_comment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_updated integer;
  v_image text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();

  select image_url into v_image
  from public.post_comments where id = p_comment_id and author_id = auth.uid() and deleted_at is null;

  update public.post_comments
  set deleted_at = now()
  where id = p_comment_id and author_id = auth.uid() and deleted_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'comment_not_deletable'; end if;

  if v_image is not null then
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects o
    where o.bucket_id = 'posts-images' and o.name = v_image;
    perform set_config('storage.allow_delete_query', 'false', true);
  end if;
end; $$;

-- -- 2) Reporting -----------------------------------------------------------

create or replace function public.report_post(
  p_cluster_id uuid,
  p_post_id uuid,
  p_reason public.report_reason,
  p_details text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reporter_id uuid := auth.uid();
  v_author uuid;
  v_report_id uuid;
begin
  if v_reporter_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if p_details is not null and char_length(p_details) > 2000 then raise exception 'details_too_long'; end if;

  select author_id into v_author from public.posts where id = p_post_id and cluster_id = p_cluster_id;
  if v_author is null then raise exception 'post_not_reportable'; end if;
  if v_author = v_reporter_id then raise exception 'cannot_report_self'; end if;

  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = v_reporter_id
  ) then raise exception 'not_a_member'; end if;
  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = v_author
  ) then raise exception 'not_a_member'; end if;

  if exists (
    select 1 from public.reports
    where reporter_id = v_reporter_id and target_user_id = v_author
      and status in ('pending', 'reviewing')
  ) then raise exception 'duplicate_report'; end if;

  insert into public.reports (cluster_id, reporter_id, target_user_id, reason, details, post_id)
  values (p_cluster_id, v_reporter_id, v_author, p_reason, p_details, p_post_id)
  returning id into v_report_id;

  return v_report_id;
end; $$;

create or replace function public.report_post_comment(
  p_cluster_id uuid,
  p_comment_id uuid,
  p_reason public.report_reason,
  p_details text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reporter_id uuid := auth.uid();
  v_author uuid;
  v_post_id uuid;
  v_report_id uuid;
begin
  if v_reporter_id is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if p_details is not null and char_length(p_details) > 2000 then raise exception 'details_too_long'; end if;

  select author_id, post_id into v_author, v_post_id
  from public.post_comments where id = p_comment_id and deleted_at is null;
  if v_author is null then raise exception 'comment_not_reportable'; end if;

  select cluster_id into p_cluster_id from public.posts where id = v_post_id;
  if not exists (select 1 from public.posts where id = v_post_id and cluster_id = p_cluster_id) then
    raise exception 'comment_not_reportable';
  end if;

  if v_author = v_reporter_id then raise exception 'cannot_report_self'; end if;
  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = v_reporter_id
  ) then raise exception 'not_a_member'; end if;
  if not exists (
    select 1 from public.cluster_members
    where cluster_id = p_cluster_id and left_at is null and user_id = v_author
  ) then raise exception 'not_a_member'; end if;

  if exists (
    select 1 from public.reports
    where reporter_id = v_reporter_id and target_user_id = v_author
      and status in ('pending', 'reviewing')
  ) then raise exception 'duplicate_report'; end if;

  insert into public.reports (cluster_id, reporter_id, target_user_id, reason, details, comment_id)
  values (p_cluster_id, v_reporter_id, v_author, p_reason, p_details, p_comment_id)
  returning id into v_report_id;

  return v_report_id;
end; $$;

-- -- 3) Internal report guard + close (additive, mirrors 0066 for messages) ---

create function public.assert_post_report_actionable(
  p_report_id uuid,
  p_post_id uuid default null,
  p_comment_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_status public.report_status;
  v_assigned uuid;
  v_post uuid;
  v_comment uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;

  select status, assigned_to, post_id, comment_id
    into v_status, v_assigned, v_post, v_comment
  from public.reports where id = p_report_id;
  if v_status is null then raise exception 'report_not_found'; end if;
  if v_status not in ('pending', 'reviewing') then raise exception 'report_not_open'; end if;
  if v_status = 'reviewing' and v_assigned is distinct from v_actor then
    raise exception 'cannot_resolve_not_assigned_to_you';
  end if;
  if p_post_id is not null and v_post is distinct from p_post_id then
    raise exception 'report_post_mismatch';
  end if;
  if p_comment_id is not null and v_comment is distinct from p_comment_id then
    raise exception 'report_comment_mismatch';
  end if;
end; $$;

create function public.close_post_report_as_actioned(
  p_report_id uuid,
  p_note text,
  p_post_id uuid default null,
  p_comment_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_assigned uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();
  perform public.assert_post_report_actionable(p_report_id, p_post_id, p_comment_id);

  select assigned_to into v_assigned from public.reports where id = p_report_id;

  update public.reports
  set status = 'actioned',
      resolution_note = coalesce(p_note, resolution_note),
      reviewed_by = v_actor,
      reviewed_at = now(),
      assigned_to = coalesce(v_assigned, v_actor),
      updated_at = now()
  where id = p_report_id;
end; $$;

-- -- 4) Moderator content actions -------------------------------------------

create function public.hide_post(
  p_post_id uuid,
  p_reason text,
  p_report_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
  v_author uuid;
  v_cluster uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;
  if p_report_id is not null then
    perform public.assert_post_report_actionable(p_report_id, p_post_id);
  end if;

  select author_id, cluster_id into v_author, v_cluster from public.posts where id = p_post_id;

  update public.posts
  set moderation_status = 'rejected'
  where id = p_post_id and moderation_status is distinct from 'rejected';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'post_not_found_or_already_hidden'; end if;

  insert into public.moderation_actions (actor_id, report_id, post_id, action, reason, metadata)
  values (v_actor, p_report_id, p_post_id, 'post_hidden', p_reason, jsonb_build_object('hidden', true));

  if v_author is not null and v_author <> v_actor then
    insert into public.notifications (user_id, type, cluster_id, title, body)
    values (v_author, 'moderation_notice', v_cluster,
            'Your post was hidden',
            'A post you shared was hidden because it did not follow our community guidelines.');
  end if;

  if p_report_id is not null then
    perform public.close_post_report_as_actioned(p_report_id, p_reason, p_post_id);
  end if;
end; $$;

create function public.restore_post(
  p_post_id uuid,
  p_reason text,
  p_report_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;
  if p_report_id is not null then
    perform public.assert_post_report_actionable(p_report_id, p_post_id);
  end if;

  update public.posts
  set moderation_status = 'approved'
  where id = p_post_id and moderation_status is distinct from 'approved';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'post_not_found_or_not_hidden'; end if;

  insert into public.moderation_actions (actor_id, report_id, post_id, action, reason, metadata)
  values (v_actor, p_report_id, p_post_id, 'post_restored', p_reason, jsonb_build_object('hidden', false));

  if p_report_id is not null then
    perform public.close_post_report_as_actioned(p_report_id, p_reason, p_post_id);
  end if;
end; $$;

create function public.hide_post_comment(
  p_comment_id uuid,
  p_reason text,
  p_report_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
  v_author uuid;
  v_post uuid;
  v_cluster uuid;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;
  if p_report_id is not null then
    perform public.assert_post_report_actionable(p_report_id, null, p_comment_id);
  end if;

  select author_id, post_id into v_author, v_post from public.post_comments where id = p_comment_id;
  select cluster_id into v_cluster from public.posts where id = v_post;

  update public.post_comments
  set moderation_status = 'rejected'
  where id = p_comment_id and moderation_status is distinct from 'rejected';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'comment_not_found_or_already_hidden'; end if;

  insert into public.moderation_actions (actor_id, report_id, comment_id, action, reason, metadata)
  values (v_actor, p_report_id, p_comment_id, 'post_comment_hidden', p_reason, jsonb_build_object('hidden', true));

  if v_author is not null and v_author <> v_actor then
    insert into public.notifications (user_id, type, cluster_id, title, body)
    values (v_author, 'moderation_notice', v_cluster,
            'Your comment was hidden',
            'A comment you posted was hidden because it did not follow our community guidelines.');
  end if;

  if p_report_id is not null then
    perform public.close_post_report_as_actioned(p_report_id, p_reason, null, p_comment_id);
  end if;
end; $$;

create function public.restore_post_comment(
  p_comment_id uuid,
  p_reason text,
  p_report_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_updated integer;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  perform public.assert_can_moderate();
  if p_reason is null or char_length(p_reason) = 0 then raise exception 'reason_required'; end if;
  if char_length(p_reason) > 2000 then raise exception 'reason_too_long'; end if;
  if p_report_id is not null then
    perform public.assert_post_report_actionable(p_report_id, null, p_comment_id);
  end if;

  update public.post_comments
  set moderation_status = 'approved'
  where id = p_comment_id and moderation_status is distinct from 'approved';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'comment_not_found_or_not_hidden'; end if;

  insert into public.moderation_actions (actor_id, report_id, comment_id, action, reason, metadata)
  values (v_actor, p_report_id, p_comment_id, 'post_comment_restored', p_reason, jsonb_build_object('hidden', false));

  if p_report_id is not null then
    perform public.close_post_report_as_actioned(p_report_id, p_reason, null, p_comment_id);
  end if;
end; $$;

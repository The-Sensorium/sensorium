-- 0208_post_comment_edit.sql
-- Let an author edit their own post comment. Mirrors edit_post (0081): a
-- security-definer RPC re-checks ownership and content length and stamps
-- edited_at, so the client never updates the table directly. Editing fires no
-- notifications: mention and reply rows are created on insert only
-- (create_post_comment, 0207), so an edit never re-pings anyone. Same rule as
-- chat and post edits (edited content is replaced in place, `edited_at` shown).
--
-- post_comments.edited_at is new; posts and messages already carry one.

alter table public.post_comments
  add column edited_at timestamptz;

create function public.edit_post_comment(
  p_comment_id uuid,
  p_content text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_updated integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.assert_account_can_write();
  if p_content is null or char_length(p_content) < 1 or char_length(p_content) > 1000 then
    raise exception 'content_out_of_range';
  end if;

  update public.post_comments
  set content = p_content, edited_at = now()
  where id = p_comment_id and author_id = auth.uid() and deleted_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'comment_not_editable'; end if;
end; $$;

grant execute on function public.edit_post_comment(uuid, text) to authenticated;
grant execute on function public.edit_post_comment(uuid, text) to service_role;

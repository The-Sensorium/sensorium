-- 0076_posts_grants.sql
-- Table + function privileges for the posts tables, mirroring 0017/0019. Follows
-- 0075. Row-level access stays enforced by the RLS policies from 0072; these
-- grants only make the tables reachable through PostgREST, and the RPC functions
-- are `security definer` so they need no grants to run.

grant select on public.posts to authenticated;
grant select on public.post_comments to authenticated;
grant select on public.post_likes to authenticated;

grant execute on function
  public.create_post(uuid, text, text, text),
  public.edit_post(uuid, text),
  public.delete_post(uuid),
  public.toggle_post_like(uuid),
  public.create_post_comment(uuid, text, text, text),
  public.delete_post_comment(uuid)
  to authenticated;

grant execute on function
  public.report_post(uuid, uuid, public.report_reason, text),
  public.report_post_comment(uuid, uuid, public.report_reason, text)
  to authenticated;

grant execute on function
  public.hide_post(uuid, text, uuid),
  public.restore_post(uuid, text, uuid),
  public.hide_post_comment(uuid, text, uuid),
  public.restore_post_comment(uuid, text, uuid)
  to authenticated;

grant execute on function
  public.create_post(uuid, text, text, text),
  public.edit_post(uuid, text),
  public.delete_post(uuid),
  public.toggle_post_like(uuid),
  public.create_post_comment(uuid, text, text, text),
  public.delete_post_comment(uuid),
  public.hide_post(uuid, text, uuid),
  public.restore_post(uuid, text, uuid),
  public.hide_post_comment(uuid, text, uuid),
  public.restore_post_comment(uuid, text, uuid)
  to service_role;

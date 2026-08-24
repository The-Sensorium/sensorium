-- 0074_posts_realtime.sql
-- Register the posts tables with Postgres Changes realtime so post/like/comment
-- events stream to the cluster channel. Mirrors 0021. Follows 0073.
--
-- NOTE: after this migration, restart the local stack (`supabase stop &&
-- supabase start`) for realtime to pick up the new tables.

alter publication supabase_realtime add table
  public.posts,
  public.post_comments,
  public.post_likes;

insert into realtime.subscription (subscription_id, entity, claims)
select gen_random_uuid(), t.e::regclass, jsonb_build_object('role', 'authenticated')
from unnest(array[
  'posts',
  'post_comments',
  'post_likes'
]) as t(e);

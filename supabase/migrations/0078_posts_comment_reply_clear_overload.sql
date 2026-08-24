-- 0078_posts_comment_reply_clear_overload.sql
-- 0077 added the parent_comment_id parameter. `create or replace` only replaces a
-- function with an identical signature, so it created a SECOND overload rather
-- than replacing the 4-arg one. With two overloads, PostgREST rejects calls that
-- omit the defaulted argument as ambiguous (the 0057 lesson). Drop the stale
-- 4-arg overload so only the 5-arg form remains. Follows 0077.

drop function public.create_post_comment(uuid, text, text, text);

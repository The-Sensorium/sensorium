-- 0140_feed_counts.sql
-- S-10 (revised post-S-09): bounded engagement counts RPCs.
--
-- S-09 collapsed reactions/likes/comments/replies to single
-- eq(cluster_id) queries, but those are whole-cluster row fetches with no
-- pagination, and useClusterVoteResponses is still a two-step .in(vote_ids)
-- fan-out with a per-row RLS subselect on vote_responses. sortPostsForFeed
-- ranks only the loaded slice.
--
-- These three security-definer counters return per-id counts via GROUP BY so
-- the feed can rank from small count rows instead of full row sets. The vote
-- counter also returns the caller's own choice per vote, replacing the
-- two-step vote_ids-then-.in() responses fetch. The full get_post_feed()
-- redesign stays deferred (see S-10). No new index: reads use
-- posts_cluster_idx (0072) plus the S-09 cluster_id indexes.
--
-- Visibility matches the row RLS: post counts require active membership of an
-- unlocked cluster and count only visible comments (not deleted,
-- moderation-approved); vote/signal counts require active membership.
-- Non-members (and locked clusters for posts) get zero rows, not an error, so
-- callers render zeros instead of toast failures.

create or replace function public.get_post_counts(p_cluster_id uuid)
returns table (post_id uuid, likes_count integer, comments_count integer)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not public.is_active_member(p_cluster_id) then
    return;
  end if;
  if not public.cluster_unlocked(p_cluster_id) then
    return;
  end if;
  return query
    select
      p.id as post_id,
      coalesce(l.cnt, 0)::int as likes_count,
      coalesce(c.cnt, 0)::int as comments_count
    from public.posts p
    left join (
      select pl.post_id, count(*) as cnt
      from public.post_likes pl
      where pl.cluster_id = p_cluster_id
      group by pl.post_id
    ) l on l.post_id = p.id
    left join (
      select pc.post_id, count(*) as cnt
      from public.post_comments pc
      where pc.cluster_id = p_cluster_id
        and pc.deleted_at is null
        and pc.moderation_status = 'approved'
      group by pc.post_id
    ) c on c.post_id = p.id
    where p.cluster_id = p_cluster_id
      and p.deleted_at is null
      and p.moderation_status = 'approved';
end;
$function$;

revoke execute on function public.get_post_counts(uuid) from public, anon;
grant execute on function public.get_post_counts(uuid) to authenticated;

create or replace function public.get_vote_counts(p_cluster_id uuid)
returns table (vote_id uuid, cast_count integer, my_choice text)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not public.is_active_member(p_cluster_id) then
    return;
  end if;
  return query
    select
      v.id as vote_id,
      count(vr.vote_id)::int as cast_count,
      (
        select vr_mine.choice
        from public.vote_responses vr_mine
        where vr_mine.vote_id = v.id
          and vr_mine.user_id = auth.uid()
      ) as my_choice
    from public.votes v
    left join public.vote_responses vr on vr.vote_id = v.id
    where v.cluster_id = p_cluster_id
    group by v.id;
end;
$function$;

revoke execute on function public.get_vote_counts(uuid) from public, anon;
grant execute on function public.get_vote_counts(uuid) to authenticated;

create or replace function public.get_signal_reply_counts(p_cluster_id uuid)
returns table (signal_id uuid, reply_count integer)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not public.is_active_member(p_cluster_id) then
    return;
  end if;
  return query
    select
      s.id as signal_id,
      coalesce(r.cnt, 0)::int as reply_count
    from public.signals s
    left join (
      select sr.signal_id, count(*) as cnt
      from public.signal_replies sr
      where sr.cluster_id = p_cluster_id
      group by sr.signal_id
    ) r on r.signal_id = s.id
    where s.cluster_id = p_cluster_id;
end;
$function$;

revoke execute on function public.get_signal_reply_counts(uuid) from public, anon;
grant execute on function public.get_signal_reply_counts(uuid) to authenticated;

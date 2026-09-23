import { useEffect, useMemo, useState } from 'react'
import { ChevronUp, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useDocumentTitle } from '../../lib/use-document-title'
import { useAuth } from '../../app/auth-context'
import { useClusterMembers, useMyClusters } from '../../features/matching'
import {
  useLoadEarlierPosts,
  POSTS_PAGE_SIZE,
  sortPostsForFeed,
  type PostSort,
} from '../../features/posts'
import {
  useClusterPosts,
  useClusterPostLikes,
  usePostCounts,
  useTogglePostLike,
} from '../../features/posts'
import { useClusterChannel } from '../../features/realtime'
import { isMutedAuthor, mutedIds, toggleRevealedId, useMyMutes } from '../../features/moderation'
import { MutedHideBar, MutedPlaceholder } from '../../components/MutedPlaceholder'
import { PostComposer } from '../../components/PostComposer'
import { PostCard } from '../../components/PostCard'

export function PostsFeedPage() {
  useDocumentTitle('Posts')
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const clusters = useMyClusters()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sort, setSort] = useState<PostSort>('new')

  const clusterIds = useMemo(() => (clusters.data ?? []).map((c) => c.cluster.id), [clusters.data])
  useEffect(() => {
    if (selectedId && clusterIds.includes(selectedId)) return
    const first = clusterIds[0]
    if (first) setSelectedId(first)
    else setSelectedId(null)
  }, [clusterIds, selectedId])

  const clusterId = selectedId
  const posts = useClusterPosts(clusterId)
  const members = useClusterMembers(clusterId)
  const likes = useClusterPostLikes(clusterId)
  const counts = usePostCounts(clusterId)
  const toggle = useTogglePostLike(clusterId)
  const loadEarlier = useLoadEarlierPosts(clusterId)
  const myMutes = useMyMutes(clusterId != null)
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  function toggleReveal(id: string) {
    setRevealed((prev) => toggleRevealedId(prev, id))
  }

  useClusterChannel(clusterId)

  const memberById = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m])),
    [members.data],
  )
  const countByPost = useMemo(() => {
    const map = new Map<string, { likes: number; comments: number }>()
    for (const c of counts.data ?? []) {
      map.set(c.post_id, { likes: c.likes_count, comments: c.comments_count })
    }
    return map
  }, [counts.data])
  const mineByPost = useMemo(() => {
    const set = new Set<string>()
    for (const l of likes.data ?? []) {
      if (l.user_id === userId) set.add(l.post_id)
    }
    return set
  }, [likes.data, userId])
  const likesMap = useMemo(() => {
    const byPost = new Map<string, { count: number; mine: boolean }>()
    for (const [postId, c] of countByPost) {
      byPost.set(postId, { count: c.likes, mine: mineByPost.has(postId) })
    }
    for (const postId of mineByPost) {
      const entry = byPost.get(postId) ?? { count: 0, mine: false }
      entry.mine = true
      byPost.set(postId, entry)
    }
    return byPost
  }, [countByPost, mineByPost])
  const commentCount = useMemo(() => {
    const byPost = new Map<string, number>()
    for (const [postId, c] of countByPost) byPost.set(postId, c.comments)
    return byPost
  }, [countByPost])

  const sorted = useMemo(
    () =>
      sortPostsForFeed(
        posts.data ?? [],
        sort,
        (p) => ({ likes: likesMap.get(p.id)?.count ?? 0, comments: commentCount.get(p.id) ?? 0 }),
      ),
    [posts.data, sort, likesMap, commentCount],
  )

  // Likes/comments are whole-cluster caches (S-09 cluster_id), so earlier pages
  // are already covered; the live channel patches arrivals.
  const selected = (clusters.data ?? []).find((c) => c.cluster.id === selectedId)
  const hasMore =
    (posts.data?.length ?? 0) >= POSTS_PAGE_SIZE && loadEarlier.data?.hasMore !== false

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-semibold text-on-surface">Posts</h1>
          <p className="text-xs text-on-surface-variant">Share something with your cluster.</p>
        </div>
        <div
          role="group"
          aria-label="Sort posts"
          className="inline-flex items-center gap-1 rounded-pill border border-outline-variant/70 p-1"
        >
          {(['new', 'top'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={sort === option}
              onClick={() => setSort(option)}
              className={cn(
                'min-h-[44px] rounded-pill px-4 py-2.5 text-xs font-semibold capitalize transition-colors',
                sort === option
                  ? 'bg-primary-container/15 text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {clusters.isLoading ? (
        <div role="status" className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Loading…
        </div>
      ) : (clusters.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center text-sm text-on-surface-variant">
          You aren’t in a cluster yet. Join a matching mode to start sharing posts.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose a cluster">
            {(clusters.data ?? []).map((c) => (
              <button
                key={c.cluster.id}
                type="button"
                role="tab"
                aria-selected={c.cluster.id === selectedId}
                onClick={() => setSelectedId(c.cluster.id)}
                className={cn(
                  'min-h-[44px] rounded-pill px-5 py-2.5 text-sm font-semibold transition-colors',
                  c.cluster.id === selectedId
                    ? 'bg-primary-container/15 text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                )}
              >
                {c.cluster.name}
              </button>
            ))}
          </div>

          {clusterId && <PostComposer clusterId={clusterId} />}

          {posts.isLoading || myMutes.isLoading || !selected ? (
            <div role="status" aria-label="Loading posts" className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Loading posts…
              </div>
              <div aria-hidden className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-2xl border border-outline-variant/60 bg-surface-container/60 motion-reduce:animate-none"
                  />
                ))}
              </div>
            </div>
          ) : (posts.data ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center text-sm text-on-surface-variant">
              No posts in {selected.cluster.name} yet. Share the first one.
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {sorted.map((post) => {
                  const postMuted = isMutedAuthor(mutedSet, post.author_id)
                  if (postMuted && !revealed.has(post.id)) {
                    const author = memberById.get(post.author_id)
                    return (
                      <MutedPlaceholder
                        key={post.id}
                        name={author?.display_name ?? 'Member'}
                        onToggle={() => toggleReveal(post.id)}
                        kind="post"
                      />
                    )
                  }
                  const like = likesMap.get(post.id)
                  return (
                    <div key={post.id} className="space-y-2">
                      {postMuted ? (
                        <MutedHideBar
                          name={memberById.get(post.author_id)?.display_name ?? 'Member'}
                          onToggle={() => toggleReveal(post.id)}
                          kind="post"
                        />
                      ) : null}
                      <PostCard
                        post={post}
                        clusterId={clusterId!}
                        compact
                        author={memberById.get(post.author_id)}
                        likeCount={like?.count ?? 0}
                        likedByMe={like?.mine ?? false}
                        commentCount={commentCount.get(post.id) ?? 0}
                        onLike={(postId) => void toggle.mutateAsync(postId)}
                      />
                    </div>
                  )
                })}
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => void loadEarlier.mutate()}
                  disabled={loadEarlier.isPending}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-pill border border-outline-variant/70 px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-60"
                >
                  {loadEarlier.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ChevronUp className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  )}
                  {loadEarlier.isPending ? 'Loading…' : 'Load earlier posts'}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

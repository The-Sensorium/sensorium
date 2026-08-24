import { useEffect, useMemo, useRef, useState } from 'react'
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
  useClusterPostComments,
  useClusterPostLikes,
  useTogglePostLike,
} from '../../features/posts'
import { useClusterChannel } from '../../features/realtime'
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
  const likes = useClusterPostLikes(clusterId, (posts.data ?? []).map((p) => p.id))
  const comments = useClusterPostComments(clusterId, (posts.data ?? []).map((p) => p.id))
  const toggle = useTogglePostLike(clusterId)
  const loadEarlier = useLoadEarlierPosts(clusterId)

  useClusterChannel(clusterId)

  const memberById = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m])),
    [members.data],
  )
  const likesMap = useMemo(() => {
    const byPost = new Map<string, { count: number; mine: boolean }>()
    for (const l of likes.data ?? []) {
      const entry = byPost.get(l.post_id) ?? { count: 0, mine: false }
      entry.count += 1
      if (l.user_id === userId) entry.mine = true
      byPost.set(l.post_id, entry)
    }
    return byPost
  }, [likes.data, userId])
  const commentCount = useMemo(() => {
    const byPost = new Map<string, number>()
    for (const c of comments.data ?? []) byPost.set(c.post_id, (byPost.get(c.post_id) ?? 0) + 1)
    return byPost
  }, [comments.data])

  const sorted = useMemo(
    () =>
      sortPostsForFeed(
        posts.data ?? [],
        sort,
        (p) => ({ likes: likesMap.get(p.id)?.count ?? 0, comments: commentCount.get(p.id) ?? 0 }),
      ),
    [posts.data, sort, likesMap, commentCount],
  )

  // Likes/comments are cluster-scoped caches that fetch once for the initially
  // loaded posts. When "Load earlier" grows the set, refetch them so newly added
  // posts are ranked on their real engagement instead of a 0-engagement tie.
  const postIdsKey = (posts.data ?? []).map((p) => p.id).join(',')
  const prevPostIdsKey = useRef(postIdsKey)
  const refetchEngagement = useRef({ likes: likes.refetch, comments: comments.refetch })
  refetchEngagement.current = { likes: likes.refetch, comments: comments.refetch }
  useEffect(() => {
    if (prevPostIdsKey.current === postIdsKey) return
    prevPostIdsKey.current = postIdsKey
    void refetchEngagement.current.likes()
    void refetchEngagement.current.comments()
  }, [postIdsKey])

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
                'rounded-pill px-3 py-1 text-xs font-semibold capitalize transition-colors',
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
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
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
                  'rounded-pill px-4 py-2 text-sm font-semibold transition-colors',
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

          {posts.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading posts…
            </div>
          ) : (posts.data ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center text-sm text-on-surface-variant">
              No posts in {selected?.cluster.name ?? 'this cluster'} yet. Share the first one.
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {sorted.map((post) => {
                  const like = likesMap.get(post.id)
                  return (
                    <PostCard
                      key={post.id}
                      post={post}
                      clusterId={clusterId!}
                      author={memberById.get(post.author_id)}
                      likeCount={like?.count ?? 0}
                      likedByMe={like?.mine ?? false}
                      commentCount={commentCount.get(post.id) ?? 0}
                      onLike={(postId) => void toggle.mutateAsync(postId)}
                    />
                  )
                })}
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => void loadEarlier.mutate()}
                  disabled={loadEarlier.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-pill border border-outline-variant/70 px-4 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-60"
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

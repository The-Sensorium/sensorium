import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../src/auth-context'
import { useClusterMembers, useMyClusters } from '../../src/features/matching'
import {
  useLoadEarlierPosts,
  POSTS_PAGE_SIZE,
  sortPostsForFeed,
  type PostSort,
} from '../../src/features/posts'
import {
  useClusterPosts,
  useClusterPostComments,
  useClusterPostLikes,
  useTogglePostLike,
} from '../../src/features/posts'
import { useClusterChannel } from '../../src/features/realtime'
import { isMutedAuthor, mutedIds, useMyMutes } from '../../src/features/moderation'
import { MutedPlaceholder } from '../../src/components/MutedPlaceholder'
import { PostComposer } from '../../src/components/PostComposer'
import { PostCard } from '../../src/components/PostCard'
import { radii, spacing } from '../../src/lib/theme-tokens'
import { useTheme } from '../../src/lib/use-theme'
import { Card, ErrorText, LoadingView } from '../../src/components/ui'
import { usePullToRefresh } from '../../src/lib/use-pull-to-refresh'

export default function PostsFeedScreen() {
  const t = useTheme()
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
  const myMutes = useMyMutes(clusterId != null)
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const pull = usePullToRefresh([
    () => clusters.refetch(),
    () => posts.refetch(),
    () => members.refetch(),
    () => likes.refetch(),
    () => comments.refetch(),
    () => myMutes.refetch(),
  ])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  function reveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

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
  const inCluster = !clusters.isLoading && (clusters.data ?? []).length > 0
  const feedLoading = clusters.isLoading || posts.isLoading || myMutes.isLoading

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        data={inCluster && !posts.isLoading && !myMutes.isLoading ? sorted : []}
        keyExtractor={(post) => post.id}
        renderItem={({ item: post }) => {
          if (isMutedAuthor(mutedSet, post.author_id) && !revealed.has(post.id)) {
            const author = memberById.get(post.author_id)
            return (
              <MutedPlaceholder
                name={author?.display_name ?? 'Member'}
                onToggle={() => reveal(post.id)}
              />
            )
          }
          const like = likesMap.get(post.id)
          return (
            <PostCard
              post={post}
              clusterId={clusterId!}
              author={memberById.get(post.author_id)}
              likeCount={like?.count ?? 0}
              likedByMe={like?.mine ?? false}
              commentCount={commentCount.get(post.id) ?? 0}
              onLike={(postId) => void toggle.mutateAsync(postId)}
            />
          )
        }}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>Posts</Text>
                <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                  Share something with your cluster.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, padding: 4, gap: 4 }}>
                {(['new', 'top'] as const).map((option) => {
                  const active = sort === option
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setSort(option)}
                      style={{ borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: active ? t.surfaceContainer : 'transparent' }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'capitalize', color: active ? t.primary : t.onSurfaceVariant }}>
                        {option}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
            <ErrorText message={pull.error} />
            {inCluster ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {(clusters.data ?? []).map((c) => {
                  const active = c.cluster.id === selectedId
                  return (
                    <Pressable
                      key={c.cluster.id}
                      onPress={() => setSelectedId(c.cluster.id)}
                      style={{ borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: active ? t.surfaceContainer : 'transparent' }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: active ? t.primary : t.onSurfaceVariant }} numberOfLines={1}>
                        {c.cluster.name}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            ) : null}
            {inCluster && clusterId ? <PostComposer clusterId={clusterId} /> : null}
          </>
        }
        ListEmptyComponent={
          feedLoading ? (
            <LoadingView label="Loading posts…" />
          ) : posts.isError || myMutes.isError ? (
            <Card>
              <Text style={{ fontSize: 14, textAlign: 'center', color: t.error }}>
                Couldn’t load posts. Please try again.
              </Text>
            </Card>
          ) : !inCluster ? (
            <Card>
              <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
                You aren’t in a cluster yet. Join a matching mode to start sharing posts.
              </Text>
            </Card>
          ) : (
            <Card plain>
              <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
                No posts in {selected?.cluster.name ?? 'this cluster'} yet. Share the first one.
              </Text>
            </Card>
          )
        }
        ListFooterComponent={
          inCluster && hasMore && sorted.length > 0 ? (
            <Pressable
              onPress={() => void loadEarlier.mutate()}
              disabled={loadEarlier.isPending}
              style={{ borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 12, alignItems: 'center', opacity: loadEarlier.isPending ? 0.6 : 1 }}
            >
              {loadEarlier.isPending ? (
                <ActivityIndicator size="small" color={t.onSurfaceVariant} />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                  Load earlier posts
                </Text>
              )}
            </Pressable>
          ) : null
        }
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: spacing.containerMargin, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            tintColor={t.primary}
            colors={[t.primary]}
            progressBackgroundColor={t.surfaceContainer}
          />
        }
      />
    </SafeAreaView>
  )
}

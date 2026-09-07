import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useAuth } from '../../../src/auth-context'
import { useClusterMembers } from '../../../src/features/matching'
import {
  usePost,
  useClusterPostLikes,
  usePostComments,
  useTogglePostLike,
} from '../../../src/features/posts'
import { useClusterChannel } from '../../../src/features/realtime'
import { PostCard } from '../../../src/components/PostCard'
import { CommentThread } from '../../../src/components/CommentThread'
import { MutedPlaceholder } from '../../../src/components/MutedPlaceholder'
import { isMutedAuthor, mutedIds, useMyMutes } from '../../../src/features/moderation'
import { useTheme } from '../../../src/lib/use-theme'
import { Card, LoadingView, Screen } from '../../../src/components/ui'

export default function PostDetailScreen() {
  const t = useTheme()
  const { postId = '' } = useLocalSearchParams<{ postId: string }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const post = usePost(postId || null)
  const clusterId = post.data?.cluster_id ?? null
  const members = useClusterMembers(clusterId)
  const likes = useClusterPostLikes(clusterId, post.data ? [post.data.id] : [])
  const comments = usePostComments(clusterId, postId || null)
  const toggle = useTogglePostLike(clusterId)
  const myMutes = useMyMutes(clusterId != null)
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const [revealed, setRevealed] = useState(false)

  useClusterChannel(clusterId)

  const memberById = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m])),
    [members.data],
  )

  if (post.isLoading || myMutes.isLoading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    )
  }

  if (!post.data) {
    return (
      <Screen>
        <Card plain>
          <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
            This post isn’t available to you.
          </Text>
        </Card>
      </Screen>
    )
  }

  const p = post.data
  const postLikes = (likes.data ?? []).filter((l) => l.post_id === p.id)
  const likeInfo = {
    count: postLikes.length,
    mine: postLikes.some((l) => l.user_id === userId),
  }

  return (
    <Screen avoiding>
      <Pressable
        onPress={() => router.back()}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}
      >
        <ArrowLeft size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>Back</Text>
      </Pressable>

      {isMutedAuthor(mutedSet, p.author_id) && !revealed ? (
        <MutedPlaceholder
          name={memberById.get(p.author_id)?.display_name ?? 'Member'}
          onToggle={() => setRevealed(true)}
        />
      ) : (
        <PostCard
          post={p}
          clusterId={clusterId!}
          author={memberById.get(p.author_id)}
          likeCount={likeInfo.count}
          likedByMe={likeInfo.mine}
          commentCount={comments.data?.length ?? 0}
          onLike={(id) => void toggle.mutateAsync(id)}
          onDeleted={() => router.back()}
        />
      )}

      <CommentThread
        clusterId={clusterId!}
        postId={p.id}
        comments={comments.data ?? []}
        memberById={memberById}
        selfAvatar={{
          display_name: memberById.get(userId!)?.display_name ?? 'Member',
          avatar_url: memberById.get(userId!)?.avatar_url ?? null,
        }}
      />
      <View style={{ height: 16 }} />
    </Screen>
  )
}

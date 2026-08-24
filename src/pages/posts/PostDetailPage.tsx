import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { useAuth } from '../../app/auth-context'
import { useClusterMembers } from '../../features/matching'
import {
  usePost,
  useClusterPostLikes,
  usePostComments,
  useTogglePostLike,
} from '../../features/posts'
import { useClusterChannel } from '../../features/realtime'
import { PostCard } from '../../components/PostCard'
import { CommentThread } from '../../components/CommentThread'

export function PostDetailPage() {
  useDocumentTitle('Post')
  const { postId = '' } = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const post = usePost(postId)
  const clusterId = post.data?.cluster_id ?? null
  const members = useClusterMembers(clusterId)
  const likes = useClusterPostLikes(clusterId, post.data ? [post.data.id] : [])
  const comments = usePostComments(clusterId, postId)
  const toggle = useTogglePostLike(clusterId)

  useClusterChannel(clusterId)

  const memberById = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m])),
    [members.data],
  )

  if (post.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    )
  }

  if (!post.data) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center text-sm text-on-surface-variant">
        This post isn’t available to you.
      </div>
    )
  }

  const p = post.data
  const likeInfo = {
    count: (likes.data ?? []).length,
    mine: (likes.data ?? []).some((l) => l.user_id === userId),
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 rounded-pill px-3 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Back
      </button>

      <PostCard
        post={p}
        clusterId={clusterId!}
        author={memberById.get(p.author_id)}
        likeCount={likeInfo.count}
        likedByMe={likeInfo.mine}
        commentCount={comments.data?.length ?? 0}
        onLike={(id) => void toggle.mutateAsync(id)}
        onDeleted={() => navigate(-1)}
      />

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
    </div>
  )
}

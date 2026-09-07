import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { CornerUpLeft, Flag, Heart, MessageSquare, Trash2 } from 'lucide-react-native'
import { useAuth } from '../auth-context'
import { Avatar } from './Avatar'
import { PostMedia } from './PostMedia'
import { Modal } from './Modal'
import { ReportModal } from './ReportModal'
import { useDeleteComment, type PostComment } from '../features/posts'
import { toErrorMessage } from '../lib/error'
import { dateTimeFormatter } from './room/format'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { PrimaryButton } from './ui'

export function CommentItem({
  comment,
  clusterId,
  author,
  repliedToName,
  onReply,
  onLike,
  likeCount = 0,
  likedByMe = false,
  replyCount,
}: {
  comment: PostComment
  clusterId: string
  author: { id: string; display_name: string; avatar_url: string | null } | undefined
  repliedToName?: string
  onReply?: (comment: PostComment) => void
  onLike?: (commentId: string) => void
  likeCount?: number
  likedByMe?: boolean
  replyCount?: number
}) {
  const t = useTheme()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const isMine = comment.author_id === userId
  const [reportOpen, setReportOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const del = useDeleteComment(clusterId)

  async function handleDelete() {
    setDeleteError(null)
    try {
      await del.mutateAsync(comment.id)
      setConfirmOpen(false)
    } catch (e) {
      setDeleteError(toErrorMessage(e, 'Could not delete this comment. Try again.'))
    }
  }

  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Avatar name={author?.display_name ?? 'Member'} src={author?.avatar_url} size={32} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
            {author?.display_name ?? 'Member'}
          </Text>
          {isMine ? <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>(you)</Text> : null}
          <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
            · {dateTimeFormatter.format(new Date(comment.created_at))}
          </Text>
        </View>
        {comment.content ? (
          <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 20, color: t.onSurface }}>
            {repliedToName ? (
              <Text style={{ fontWeight: '600', color: t.primary }}>@{repliedToName} </Text>
            ) : null}
            {comment.content}
          </Text>
        ) : null}
        <PostMedia imageUrl={comment.image_url} gifUrl={comment.gif_url} alt={comment.content ?? 'Comment media'} />
        <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {onLike ? (
            <Pressable
              accessibilityLabel="Like comment"
              onPress={() => onLike(comment.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Heart
                size={16}
                color={likedByMe ? t.error : t.onSurfaceVariant}
                strokeWidth={2}
                fill={likedByMe ? t.error : 'transparent'}
              />
              <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>
                {likeCount}
              </Text>
            </Pressable>
          ) : null}
          {replyCount !== undefined ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MessageSquare size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>{replyCount}</Text>
            </View>
          ) : null}
          {onReply ? (
            <Pressable
              onPress={() => onReply(comment)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <CornerUpLeft size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>Reply</Text>
            </Pressable>
          ) : null}
          {isMine ? (
            <Pressable
              accessibilityLabel="Delete comment"
              onPress={() => {
                setDeleteError(null)
                setConfirmOpen(true)
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Trash2 size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>Delete</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel="Report comment"
              onPress={() => setReportOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Flag size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>Report</Text>
            </Pressable>
          )}
        </View>
      </View>
      {author ? (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          clusterId={clusterId}
          target={{ id: author.id, name: author.display_name }}
          contentTarget={{ kind: 'comment', id: comment.id }}
        />
      ) : null}
      <Modal open={confirmOpen} onClose={() => { if (!del.isPending) setConfirmOpen(false) }} title="Delete comment?">
        <Text style={{ marginTop: 12, fontSize: 14, color: t.onSurfaceVariant }}>
          This removes this comment and any replies to it. This action can&apos;t be undone.
        </Text>
        {deleteError ? (
          <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{deleteError}</Text>
        ) : null}
        <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <Pressable
            onPress={() => setConfirmOpen(false)}
            disabled={del.isPending}
            style={{ paddingHorizontal: 16, paddingVertical: 10, opacity: del.isPending ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
          </Pressable>
          <PrimaryButton
            title="Delete"
            loadingTitle="Deleting…"
            loading={del.isPending}
            onPress={() => void handleDelete()}
          />
        </View>
      </Modal>
    </View>
  )
}

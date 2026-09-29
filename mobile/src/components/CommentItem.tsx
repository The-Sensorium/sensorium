import { useState, type RefObject } from 'react'
import { Pressable, Text, View } from 'react-native'
import { CornerUpLeft, Heart, MoreVertical } from 'lucide-react-native'
import { useAuth } from '../auth-context'
import { Avatar } from './Avatar'
import { LinkifiedText } from './LinkifiedText'
import { PostActionsSheet } from './PostActionsSheet'
import { PostMedia } from './PostMedia'
import { Modal } from './Modal'
import { ReportModal } from './ReportModal'
import { useDeleteComment, type PostComment } from '../features/posts'
import { toErrorMessage } from '../lib/error'
import { lightHaptic } from '../lib/haptics'
import { dateTimeFormatter } from './room/format'
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
  highlighted,
  innerRef,
}: {
  comment: PostComment
  clusterId: string
  author: { id: string; display_name: string; avatar_url: string | null } | undefined
  repliedToName?: string
  onReply?: (comment: PostComment) => void
  onLike?: (commentId: string) => void
  likeCount?: number
  likedByMe?: boolean
  highlighted?: boolean
  innerRef?: RefObject<View | null>
}) {
  const t = useTheme()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const isMine = comment.author_id === userId
  const [menuOpen, setMenuOpen] = useState(false)
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
    <View
      ref={innerRef}
      style={{
        flexDirection: 'row',
        gap: 12,
      }}
    >
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
        {comment.content || comment.image_url || comment.gif_url ? (
          // Highlight hugs only the comment body, not the author row or actions.
          // Border and padding are always rendered (transparent when idle) so
          // the ring flash never shifts surrounding layout.
          // Bodies shift left by border (2) + padding (8) so the
          // text starts flush with the header.
          <View
            style={{
              borderWidth: 2,
              borderColor: highlighted ? t.primary : 'transparent',
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 4,
              marginLeft: -10,
            }}
          >
            {comment.content ? (
              <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 20, color: t.onSurface }}>
                {repliedToName ? (
                  <Text style={{ fontWeight: '600', color: t.primary }}>@{repliedToName} </Text>
                ) : null}
                <LinkifiedText text={comment.content} fontSize={14} lineHeight={20} />
              </Text>
            ) : null}
            <PostMedia imageUrl={comment.image_url} gifUrl={comment.gif_url} alt={comment.content ?? 'Comment media'} />
          </View>
        ) : null}
        {/* Primary actions stay grouped near the content, overflow inline after Reply. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: -8 }}>
          {onLike ? (
            <Pressable
              accessibilityLabel="Like comment"
              accessibilityRole="button"
              accessibilityState={{ selected: likedByMe }}
              onPress={() => {
                lightHaptic()
                onLike(comment.id)
              }}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 8, minHeight: 44 }}
            >
              <Heart
                size={22}
                color={likedByMe ? t.like : t.onSurfaceVariant}
                strokeWidth={2}
                fill={likedByMe ? t.like : 'transparent'}
              />
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                {likeCount}
              </Text>
            </Pressable>
          ) : null}
          {onReply ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reply to comment"
              onPress={() => onReply(comment)}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 8, minHeight: 44 }}
            >
              <CornerUpLeft size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>Reply</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Comment actions"
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 8, minHeight: 44 }}
          >
            <MoreVertical size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
          </Pressable>
        </View>
      </View>
      <PostActionsSheet
        open={menuOpen}
        mine={isMine}
        label="Comment actions"
        onClose={() => setMenuOpen(false)}
        onDelete={() => {
          setMenuOpen(false)
          setDeleteError(null)
          setConfirmOpen(true)
        }}
        onReport={() => {
          setMenuOpen(false)
          setReportOpen(true)
        }}
      />
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
        <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={() => setConfirmOpen(false)}
            disabled={del.isPending}
            hitSlop={8}
            style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, justifyContent: 'center', opacity: del.isPending ? 0.6 : 1 }}
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

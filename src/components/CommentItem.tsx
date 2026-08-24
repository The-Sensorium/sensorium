import { useState } from 'react'
import { CornerUpLeft, Flag, Heart, MessageSquare, Trash2 } from 'lucide-react'
import { useAuth } from '../app/auth-context'
import { Avatar } from './Avatar'
import { PostMedia } from './PostMedia'
import { ReportModal } from './ReportModal'
import { useDeleteComment, type PostComment } from '../features/posts'

const timeAgo = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

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
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const isMine = comment.author_id === userId
  const [reportOpen, setReportOpen] = useState(false)
  const del = useDeleteComment(clusterId)

  return (
    <li className="flex gap-3">
      <Avatar
        name={author?.display_name ?? 'Member'}
        src={author?.avatar_url}
        className="h-8 w-8"
        textClassName="text-sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-on-surface">{author?.display_name ?? 'Member'}</span>
          {isMine && <span className="text-xs text-on-surface-variant">(you)</span>}
          <span className="text-xs text-on-surface-variant">· {timeAgo.format(new Date(comment.created_at))}</span>
        </div>
        {comment.content && (
          <p className="mt-0.5 whitespace-pre-wrap text-sm leading-5">
            {repliedToName && (
              <span className="mr-1 font-semibold text-primary">@{repliedToName}</span>
            )}
            <span className="text-on-surface">{comment.content}</span>
          </p>
        )}
        <PostMedia imageUrl={comment.image_url} gifUrl={comment.gif_url} alt={comment.content ?? 'Comment media'} />
        <div className="mt-1 flex items-center gap-3">
          {onLike && (
            <button
              type="button"
              aria-pressed={likedByMe}
              onClick={() => onLike(comment.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary"
              style={{ color: likedByMe ? 'var(--color-error)' : undefined }}
            >
              <Heart
                className="h-3 w-3"
                strokeWidth={1.5}
                aria-hidden
                {...(likedByMe ? { fill: 'currentcolor' } : {})}
              />
              {likeCount}
            </button>
          )}
          {replyCount !== undefined && (
            <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
              <MessageSquare className="h-3 w-3" strokeWidth={1.5} aria-hidden /> {replyCount}
            </span>
          )}
          {onReply && (
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="inline-flex items-center gap-1 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary"
            >
              <CornerUpLeft className="h-3 w-3" strokeWidth={1.5} aria-hidden /> Reply
            </button>
          )}
          {isMine && (
            <button
              type="button"
              aria-label="Delete comment"
              onClick={() => void del.mutateAsync(comment.id)}
              disabled={del.isPending}
              className="inline-flex items-center gap-1 text-xs font-medium text-on-surface-variant transition-colors hover:text-error disabled:opacity-60"
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.5} aria-hidden /> Delete
            </button>
          )}
          {!isMine && (
            <button
              type="button"
              aria-label="Report comment"
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-on-surface-variant transition-colors hover:text-error"
            >
              <Flag className="h-3 w-3" strokeWidth={1.5} aria-hidden /> Report
            </button>
          )}
        </div>
      </div>
      {author && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          clusterId={clusterId}
          target={{ id: author.id, name: author.display_name }}
          contentTarget={{ kind: 'comment', id: comment.id }}
        />
      )}
    </li>
  )
}

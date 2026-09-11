import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  commentSummary,
  formatError,
  postSummary,
  targetSummary,
  useHidePost,
  useHidePostComment,
  useRestorePost,
  useRestorePostComment,
  type CommentSummary,
  type ModeratedMessageRow,
  type ModerationCaseV2Row,
  type PostSummary,
} from '../../../features/admin-moderation'
import { usePostImageUrl } from '../../../features/posts'

export function EvidencePanel({
  data,
  msg,
  canAct,
  busy,
  hidePending,
  restorePending,
  onHide,
  onRestore,
}: {
  data: ModerationCaseV2Row
  msg: ModeratedMessageRow | null
  canAct: boolean
  busy: boolean
  hidePending: boolean
  restorePending: boolean
  onHide: () => void
  onRestore: () => void
}) {
  const target = targetSummary(data)
  const post = postSummary(data)
  const comment = commentSummary(data)
  const imagePath = post?.image_path ?? comment?.image_path ?? null
  const { data: signedImageUrl } = usePostImageUrl(imagePath)
  const hidePost = useHidePost()
  const restorePost = useRestorePost()
  const hideComment = useHidePostComment()
  const restoreComment = useRestorePostComment()
  const [contentError, setContentError] = useState<string | null>(null)

  const contentBusy = hidePost.isPending || restorePost.isPending || hideComment.isPending || restoreComment.isPending

  async function runContent<A extends object>(mut: { mutateAsync: (args: A) => Promise<unknown> }, args: A) {
    setContentError(null)
    try {
      await mut.mutateAsync(args)
    } catch (e) {
      setContentError(formatError(e))
    }
  }

  return (
    <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
      <h2 className="text-sm font-semibold text-on-surface">Reported content</h2>
      {contentError && <p role="alert" className="mt-3 rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">{contentError}</p>}
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Reason</dt>
          <dd className="font-medium capitalize text-on-surface">{data.reason.replace(/_/g, ' ')}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Target</dt>
          <dd className="font-medium text-on-surface">{target.display_name ?? 'Unknown member'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Cluster</dt>
          <dd className="font-medium text-on-surface">{data.cluster_name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Prior reports</dt>
          <dd className="font-medium text-on-surface">{data.prior_reports} prior</dd>
        </div>
        {data.details ? (
          <p className="mt-2 rounded-xl bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">{data.details}</p>
        ) : null}
      </dl>

      {msg ? (
        <div className="mt-4 border-t border-outline-variant/50 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-on-surface">Reported message</h3>
            <span className="rounded-pill bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
              {msg.content ? 'private chat message' : 'media attachment'}
            </span>
          </div>
          {msg.content && <p className="mt-3 rounded-xl bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">{msg.content}</p>}
          {canAct ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onHide}
                disabled={busy || hidePending}
                className="inline-flex items-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                {hidePending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Hide message
              </button>
              <button
                type="button"
                onClick={onRestore}
                disabled={busy || restorePending}
                className="inline-flex items-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                {restorePending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Restore message
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {post ? (
        <ReportedPost
          post={post}
          signedImageUrl={signedImageUrl ?? null}
          canAct={canAct}
          busy={contentBusy}
          hidePending={hidePost.isPending}
          restorePending={restorePost.isPending}
          onHide={(postId) => void runContent(hidePost, { p_post_id: postId, p_reason: 'reported content', p_report_id: data.id })}
          onRestore={(postId) => void runContent(restorePost, { p_post_id: postId, p_reason: 'false positive review', p_report_id: data.id })}
        />
      ) : null}

      {comment ? (
        <ReportedComment
          comment={comment}
          signedImageUrl={signedImageUrl ?? null}
          canAct={canAct}
          busy={contentBusy}
          hidePending={hideComment.isPending}
          restorePending={restoreComment.isPending}
          onHide={(commentId) => void runContent(hideComment, { p_comment_id: commentId, p_reason: 'reported content', p_report_id: data.id })}
          onRestore={(commentId) => void runContent(restoreComment, { p_comment_id: commentId, p_reason: 'false positive review', p_report_id: data.id })}
        />
      ) : null}
    </div>
  )
}

function StatusBadges({ moderationStatus, deletedAt }: { moderationStatus: string | null; deletedAt: string | null }) {
  return (
    <span className="flex gap-1.5">
      {moderationStatus && moderationStatus !== 'approved' && (
        <span className="rounded-pill bg-error/10 px-2.5 py-1 text-xs font-semibold text-error">
          {moderationStatus === 'rejected' ? 'Hidden' : moderationStatus}
        </span>
      )}
      {deletedAt && (
        <span className="rounded-pill bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
          Deleted
        </span>
      )}
    </span>
  )
}

function ContentAction({
  label,
  pending,
  disabled,
  onClick,
}: {
  label: string
  pending: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className="inline-flex items-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {label}
    </button>
  )
}

function ReportedPost({
  post,
  signedImageUrl,
  canAct,
  busy,
  hidePending,
  restorePending,
  onHide,
  onRestore,
}: {
  post: PostSummary
  signedImageUrl: string | null
  canAct: boolean
  busy: boolean
  hidePending: boolean
  restorePending: boolean
  onHide: (postId: string) => void
  onRestore: (postId: string) => void
}) {
  const hidden = post.moderation_status === 'rejected'
  const deleted = post.deleted_at != null
  const imageSrc = post.gif_url ?? signedImageUrl ?? null
  return (
    <div className="mt-4 border-t border-outline-variant/50 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-on-surface">Reported post</h3>
        <StatusBadges moderationStatus={post.moderation_status} deletedAt={post.deleted_at} />
      </div>
      {post.title && <p className="mt-2 text-sm font-semibold text-on-surface">{post.title}</p>}
      {post.content && <p className="mt-2 rounded-xl bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">{post.content}</p>}
      {imageSrc && (
        <img src={imageSrc} alt="Reported post media" className="mt-2 max-h-64 rounded-xl object-cover" />
      )}
      <p className="mt-2 text-xs text-on-surface-variant">
        by {post.author_display_name ?? 'Unknown'} · {post.cluster_name ?? 'Unknown cluster'}
      </p>
      {canAct && post.id && !deleted ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!hidden ? (
            <ContentAction label="Hide post" pending={hidePending} disabled={busy} onClick={() => onHide(post.id as string)} />
          ) : (
            <ContentAction label="Restore post" pending={restorePending} disabled={busy} onClick={() => onRestore(post.id as string)} />
          )}
        </div>
      ) : null}
      {deleted && (
        <p className="mt-2 text-xs text-on-surface-variant">The author deleted this post; the snapshot above is what was reported.</p>
      )}
    </div>
  )
}

function ReportedComment({
  comment,
  signedImageUrl,
  canAct,
  busy,
  hidePending,
  restorePending,
  onHide,
  onRestore,
}: {
  comment: CommentSummary
  signedImageUrl: string | null
  canAct: boolean
  busy: boolean
  hidePending: boolean
  restorePending: boolean
  onHide: (commentId: string) => void
  onRestore: (commentId: string) => void
}) {
  const hidden = comment.moderation_status === 'rejected'
  const deleted = comment.deleted_at != null
  const imageSrc = comment.gif_url ?? signedImageUrl ?? null
  return (
    <div className="mt-4 border-t border-outline-variant/50 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-on-surface">Reported comment</h3>
        <StatusBadges moderationStatus={comment.moderation_status} deletedAt={comment.deleted_at} />
      </div>
      {(comment.post_title || comment.post_snippet) && (
        <p className="mt-2 text-xs text-on-surface-variant">
          On post{comment.post_title ? `: ${comment.post_title}` : ''}
          {!comment.post_title && comment.post_snippet ? `: ${comment.post_snippet}` : ''}
        </p>
      )}
      {comment.content && <p className="mt-2 rounded-xl bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">{comment.content}</p>}
      {imageSrc && (
        <img src={imageSrc} alt="Reported comment media" className="mt-2 max-h-64 rounded-xl object-cover" />
      )}
      <p className="mt-2 text-xs text-on-surface-variant">by {comment.author_display_name ?? 'Unknown'}</p>
      {canAct && comment.id && !deleted ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!hidden ? (
            <ContentAction label="Hide comment" pending={hidePending} disabled={busy} onClick={() => onHide(comment.id as string)} />
          ) : (
            <ContentAction label="Restore comment" pending={restorePending} disabled={busy} onClick={() => onRestore(comment.id as string)} />
          )}
        </div>
      ) : null}
      {deleted && (
        <p className="mt-2 text-xs text-on-surface-variant">The author deleted this comment; the snapshot above is what was reported.</p>
      )}
    </div>
  )
}

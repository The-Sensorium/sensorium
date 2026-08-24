import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { Modal } from './Modal'
import { REPORT_REASONS, useReportMember, type ReportReason } from '../features/moderation'
import { useReportComment, useReportPost } from '../features/posts'

const REPORT_ERRORS: Record<string, string> = {
  duplicate_report: 'You already have an open report against this member.',
  cannot_report_self: 'You cannot report yourself.',
  message_not_reportable: 'That message can no longer be reported.',
  not_a_member: 'Both you and the member you are reporting must be active in this cluster.',
  details_too_long: 'The details are too long. Please keep them under 2000 characters.',
  account_inactive: 'Your account is restricted right now and cannot submit reports.',
}

export function ReportModal({
  open,
  onClose,
  clusterId,
  target,
  messageId,
  contentTarget,
}: {
  open: boolean
  onClose: () => void
  clusterId: string
  target: { id: string; name: string }
  messageId?: string
  contentTarget?: { kind: 'post' | 'comment'; id: string }
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  const reportMember = useReportMember()
  const reportPost = useReportPost(clusterId)
  const reportComment = useReportComment(clusterId)
  const active =
    contentTarget?.kind === 'post' ? reportPost : contentTarget?.kind === 'comment' ? reportComment : reportMember
  const resetRef = useRef(false)

  useEffect(() => {
    if (!open) {
      resetRef.current = false
      return
    }
    if (resetRef.current) return
    resetRef.current = true
    setReason(null)
    setDetails('')
    setError(null)
    reportMember.reset()
    reportPost.reset()
    reportComment.reset()
  }, [open, reportMember, reportPost, reportComment])

  async function handleSubmit() {
    if (!reason) return
    setError(null)
    try {
      if (contentTarget?.kind === 'post') {
        await reportPost.mutateAsync({ postId: contentTarget.id, reason, details: details.trim() || undefined })
      } else if (contentTarget?.kind === 'comment') {
        await reportComment.mutateAsync({ commentId: contentTarget.id, reason, details: details.trim() || undefined })
      } else {
        await reportMember.mutateAsync({
          clusterId,
          targetUserId: target.id,
          reason,
          details: details.trim() || undefined,
          messageId,
        })
      }
    } catch (e) {
      const raw =
        e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message: unknown }).message)
          : ''
      setError(REPORT_ERRORS[raw] ?? 'Something went wrong. Please try again.')
      return
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={contentTarget ? `Report ${contentTarget.kind}` : 'Report member'}>
      {active.isSuccess ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-surface-container/50 px-4 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-primary" strokeWidth={1.5} aria-hidden />
          <p className="text-sm font-semibold text-on-surface">Report submitted</p>
          <p className="text-sm text-on-surface-variant">
            Thanks. Our moderators will review your report
            {contentTarget ? ` about this ${contentTarget.kind}` : ` about ${target.name}`}.
          </p>
        </div>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
        >
          <p className="text-sm text-on-surface-variant">
            Why are you reporting{contentTarget ? ` this ${contentTarget.kind}` : ` ${target.name}`}?
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Report reason</legend>
            {REPORT_REASONS.map((r) => (
              <label
                key={r.value}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border border-outline-variant/60 px-4 py-3 text-sm transition-colors',
                  reason === r.value
                    ? 'border-primary/60 bg-primary/5 text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container/60',
                )}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="h-4 w-4 accent-primary"
                />
                {r.label}
              </label>
            ))}
          </fieldset>

          <label className="block">
            <span className="text-sm font-semibold text-on-surface">Details</span>
            <span className="ml-1 text-xs text-on-surface-variant">(optional)</span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Anything that helps our moderators understand the issue…"
              className="mt-2 w-full resize-none rounded-xl border border-outline-variant/60 bg-surface-container/50 px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
            />
          </label>

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={!reason || active.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-error px-5 py-2.5 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {active.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Submit report
          </button>
        </form>
      )}
    </Modal>
  )
}

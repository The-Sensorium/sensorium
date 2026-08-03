import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { Modal } from './Modal'
import { REPORT_REASONS, useReportMember, type ReportReason } from '../features/moderation'

export function ReportModal({
  open,
  onClose,
  clusterId,
  target,
}: {
  open: boolean
  onClose: () => void
  clusterId: string
  target: { id: string; name: string }
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  const report = useReportMember()

  useEffect(() => {
    if (open) {
      setReason(null)
      setDetails('')
      setError(null)
    }
  }, [open])

  async function handleSubmit() {
    if (!reason) return
    setError(null)
    try {
      await report.mutateAsync({
        clusterId,
        targetUserId: target.id,
        reason,
        details: details.trim() || undefined,
      })
    } catch {
      setError('Something went wrong. Please try again.')
      return
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Report member">
      {report.isSuccess ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-surface-container/50 px-4 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-primary" strokeWidth={1.5} aria-hidden />
          <p className="text-sm font-semibold text-on-surface">Report submitted</p>
          <p className="text-sm text-on-surface-variant">
            Thanks. Our moderators will review your report about {target.name}.
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
            Why are you reporting {target.name}?
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
              maxLength={500}
              placeholder="Anything that helps our moderators understand the issue…"
              className="mt-2 w-full resize-none rounded-xl border border-outline-variant/60 bg-surface-container/50 px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
            />
          </label>

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={!reason || report.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-error px-5 py-2.5 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {report.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Submit report
          </button>
        </form>
      )}
    </Modal>
  )
}

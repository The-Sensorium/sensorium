import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { useMyQueueKeys, useLeaveQueue } from '../features/matching'
import { modeInfo, isMatchingMode } from '../lib/modes'
import { toErrorMessage } from '../lib/error'
import { QueueProgress } from '../components/QueueCard'

export function QueuePage() {
  useDocumentTitle('Queue')
  const { queueId = '' } = useParams()
  const navigate = useNavigate()
  const queues = useMyQueueKeys()
  const leave = useLeaveQueue()
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const mode = isMatchingMode(queueId) ? queueId : null
  const entry = queues.data?.find((q) => q.mode === mode)

  if (!mode) {
    return (
      <EmptyState
        title="Queue not found"
        body="That queue doesn’t exist. Head back to discovery to browse matching modes."
      />
    )
  }

  if (queues.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    )
  }

  if (!entry) {
    return (
      <EmptyState
        title="You’re not in this queue"
        body="Join it from Discovery to see the live waiting count."
        actionHref="/discovery"
        actionLabel="Go to Discovery"
      />
    )
  }

  const current = entry
  const info = modeInfo(current.mode)
  const leaving = leave.isPending

  async function handleLeave() {
    setLeaveError(null)
    try {
      await leave.mutateAsync(current.mode)
      navigate('/home')
    } catch (err) {
      setLeaveError(toErrorMessage(err, 'Could not leave the queue. Try again.'))
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 pt-2">
      <button
        type="button"
        onClick={() => navigate('/home')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Back to home
      </button>

      <div className="rounded-2xl border border-outline-variant/60 bg-surface p-6 shadow-soft">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          <info.icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          {info.label}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-on-surface">{entry.queue_key}</h1>
        <span className="mt-2 inline-flex items-center rounded-pill bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
          Matching mode
        </span>

        <QueueProgress mode={entry.mode} queueKey={entry.queue_key} className="mt-6" />

        <p className="mt-6 text-sm leading-6 text-on-surface-variant">
          Communication begins after the cluster is formed. You can browse or join other matching
          modes while you wait.
        </p>

        {confirming ? (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleLeave()}
              disabled={leaving}
              className="inline-flex items-center gap-2 rounded-pill bg-error px-5 py-2.5 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-60"
            >
              {leaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Confirm leave
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={leaving}
              className="rounded-pill px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-pill border border-primary/50 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/5"
          >
            Leave queue
          </button>
        )}
        {leaveError && (
          <p role="alert" className="mt-3 text-sm text-error">
            {leaveError}
          </p>
        )}
      </div>

      <p className="text-xs text-on-surface-variant">
        Want to match differently?{' '}
        <Link to="/discovery" className="font-semibold text-primary hover:underline">
          Explore other modes
        </Link>
        .
      </p>
    </div>
  )
}

function EmptyState({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string
  body: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
      <h1 className="font-display text-xl font-semibold text-on-surface">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-on-surface-variant">{body}</p>
      {actionHref && actionLabel && (
        <Link
          to={actionHref}
          className="mt-5 inline-flex items-center rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

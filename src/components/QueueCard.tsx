import { Link } from 'react-router'
import { LogOut } from 'lucide-react'
import { cn } from '../lib/utils'
import { CLUSTER_SIZE } from '../lib/constants'
import { useQueueCount, type MyQueueEntry } from '../features/matching'
import { modeInfo } from '../lib/modes'

/** n/8 progress bar with live count. */
export function QueueProgress({
  mode,
  queueKey,
  className,
}: {
  mode: MyQueueEntry['mode']
  queueKey: string | null
  className?: string
}) {
  const { count, isLoading } = useQueueCount(mode, queueKey)
  const current = count ?? 0
  const pct = Math.min(100, Math.round((current / CLUSTER_SIZE) * 100))

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-on-surface-variant">
          {isLoading && count === null ? 'Checking…' : `${current} of ${CLUSTER_SIZE} in queue`}
        </span>
        <span className="font-semibold text-on-surface">{pct}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-pill bg-surface-container-highest"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={CLUSTER_SIZE}
        aria-valuenow={current}
      >
        <div
          className="h-full rounded-pill bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function QueueCard({
  entry,
  onLeave,
  leaving,
}: {
  entry: MyQueueEntry
  onLeave?: () => void
  leaving?: boolean
}) {
  const info = modeInfo(entry.mode)
  return (
    <Link
      to={`/queue/${entry.mode}`}
      className="block min-w-0 rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{info.label}</p>
          <h3 className="mt-1 truncate font-display text-lg font-semibold text-on-surface">
            {entry.queue_key}
          </h3>
        </div>
        {onLeave && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onLeave()
            }}
            disabled={leaving}
            className="inline-flex items-center gap-1.5 rounded-pill border border-outline-variant/70 px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:border-error/40 hover:text-error"
            aria-label={`Leave ${info.label} queue`}
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            {leaving ? 'Leaving…' : 'Leave'}
          </button>
        )}
      </div>
      <QueueProgress mode={entry.mode} queueKey={entry.queue_key} className="mt-4" />
      <p className="mt-3 text-xs leading-5 text-on-surface-variant">
        Communication begins after the cluster is formed. You can browse or join other matching
        modes while you wait.
      </p>
    </Link>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Flag, Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { cn } from '../../lib/utils'
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUS_ORDER,
  formatError,
  useModerationQueue,
  useClaimReport,
  type QueueOrder,
  type ReportStatus,
} from '../../features/admin-moderation'
import {
  timeAgo,
  useMarkStaffNotificationsRead,
  useStaffUnreadCounts,
} from '../../features/notifications'

export function ModerationQueuePage() {
  useDocumentTitle('Report queue')
  const [status, setStatus] = useState<ReportStatus | undefined>(undefined)
  const [order, setOrder] = useState<QueueOrder>('desc')
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimMessage, setClaimMessage] = useState<string | null>(null)
  const queue = useModerationQueue({ status, order })
  const { refetch: refetchQueue, isSuccess: queueLoaded } = queue
  const claim = useClaimReport()
  const { mutate: markReportRead } = useMarkStaffNotificationsRead()
  const staffUnread = useStaffUnreadCounts()
  const reportUnread = staffUnread.data?.reports ?? 0

  const rows = queue.data?.pages.flat() ?? []

  // Clear once when the moderator opens the tab (acknowledging the queue), then
  // let the badge re-arm and persist on new arrivals until the tab is reopened.
  // Kept identical to the Appeals tab on purpose; clearing every arrival is only
  // safe while the newest items are on the current page (see the order toggle).
  const markedReadRef = useRef(false)
  useEffect(() => {
    if (queueLoaded && !markedReadRef.current) {
      markedReadRef.current = true
      markReportRead('report_new')
    }
  }, [queueLoaded, markReportRead])

  // Newest-first means a brand-new report is at the top of page 1, so when a
  // `report_new` arrives (the unread badge count increases) while this queue is
  // on screen, refresh it so the row appears immediately rather than on the next
  // visit. Only the newest-first view can surface it on the current page; in
  // oldest-first a new report lands at the end, so a refetch would show nothing.
  const prevReportUnreadRef = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevReportUnreadRef.current
    prevReportUnreadRef.current = reportUnread
    if (prev === null || !queueLoaded) return
    if (order === 'desc' && reportUnread > prev) void refetchQueue()
  }, [reportUnread, queueLoaded, refetchQueue, order])

  return (
    <div className="space-y-6">
      <header className="space-y-4 pt-2">
        <div>
          <h1 className="font-display text-3xl font-semibold text-on-surface">Report queue</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Open reports across the platform, {order === 'desc' ? 'newest first' : 'oldest first'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-pill border border-outline-variant/60 bg-surface p-1">
            {([undefined, ...REPORT_STATUS_ORDER] as (ReportStatus | undefined)[]).map((s) => (
              <button
                key={s ?? 'all'}
                type="button"
                onClick={() => {
                  setClaimError(null)
                  setClaimMessage(null)
                  setStatus(s)
                }}
                aria-pressed={status === s}
                className={cn(
                  'rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
                  status === s ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {s ? REPORT_STATUS_LABELS[s] : 'All'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-on-surface-variant">Sort</span>
            <div role="group" aria-label="Report order" className="flex gap-1 rounded-pill border border-outline-variant/60 bg-surface p-1">
              {(['desc', 'asc'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => {
                    setClaimError(null)
                    setClaimMessage(null)
                    setOrder(o)
                  }}
                  aria-pressed={order === o}
                  className={cn(
                    'rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
                    order === o ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  {o === 'desc' ? 'Newest' : 'Oldest'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {queue.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : queue.isError ? (
        <div className="rounded-2xl border border-error/30 bg-error/10 p-10 text-center">
          <p className="text-sm font-semibold text-error">Couldn’t load the queue.</p>
          <button
            type="button"
            onClick={() => void queue.refetch()}
            className="mt-4 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            Try Again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
          <Flag className="mx-auto h-7 w-7 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">No {status ? REPORT_STATUS_LABELS[status].toLowerCase() : 'open'} reports right now.</p>
        </div>
      ) : (
        <>
          {claimError && <p role="alert" className="rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">{claimError}</p>}
          {claimMessage && <p role="status" className="rounded-2xl border border-primary/30 bg-primary-container/10 p-3 text-sm text-on-surface">{claimMessage}</p>}
          <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-3 rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft transition-colors hover:border-primary/40 hover:bg-primary-container/5 sm:flex-row sm:items-center">
              <Link
                to={`./${row.id}`}
                className="flex min-w-0 flex-1 items-start gap-4 text-left"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-container text-on-surface-variant">
                  <Flag className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-on-surface">
                      {row.reason.replace(/_/g, ' ')}: {row.target_display_name}
                    </span>
                    <span className="shrink-0 text-xs text-on-surface-variant">{timeAgo(row.created_at)}</span>
                  </span>
                  <span className="mt-1 block text-sm text-on-surface-variant">
                    {row.cluster_name} · {row.details ? row.details : 'no details'}
                  </span>
                </span>
              </Link>
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-outline-variant/50 pt-3 sm:border-t-0 sm:pt-0">
                <span className="rounded-pill bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
                  {REPORT_STATUS_LABELS[row.status]}
                </span>
                {row.status === 'pending' && !row.assigned_to ? (
                  <button
                    type="button"
                    disabled={claim.isPending}
                    onClick={() => {
                      setClaimError(null)
                      setClaimMessage(null)
                      void claim.mutateAsync({ p_report_id: row.id })
                        .then(() => setClaimMessage('Case claimed successfully.'))
                        .catch((error) => setClaimError(formatError(error)))
                    }}
                    className="rounded-pill border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
                  >
                    Claim
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          </ul>
          <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
            <span>
              {rows.length} report{rows.length === 1 ? '' : 's'} shown
              {queue.hasNextPage &&
                (queue.isFetchingNextPage
                  ? ` · loading ${order === 'desc' ? 'older' : 'newer'}…`
                  : ` · ${order === 'desc' ? 'older' : 'newer'} reports available`)}
            </span>
            {queue.hasNextPage && !queue.isFetchingNextPage && (
              <button
                type="button"
                onClick={() => void queue.fetchNextPage()}
                className="rounded-pill border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
              >
                Load {order === 'desc' ? 'older' : 'newer'} reports
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

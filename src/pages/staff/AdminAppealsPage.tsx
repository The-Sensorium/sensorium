import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Loader2, MessageSquareWarning } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { cn } from '../../lib/utils'
import {
  APPEAL_STATUS_LABELS,
  useAdminAppeals,
  type AppealStatus,
  type QueueOrder,
} from '../../features/appeals'
import {
  timeAgo,
  useMarkStaffNotificationsRead,
  useStaffUnreadCounts,
} from '../../features/notifications'

const PAGE_SIZE = 25

export function AdminAppealsPage() {
  useDocumentTitle('Appeals')
  const [status, setStatus] = useState<AppealStatus | 'all'>('submitted')
  const [order, setOrder] = useState<QueueOrder>('desc')
  const [page, setPage] = useState(1)
  const queue = useAdminAppeals({ status, order, page, pageSize: PAGE_SIZE })
  const { refetch: refetchQueue, isSuccess: queueLoaded } = queue
  const { mutate: markAppealRead } = useMarkStaffNotificationsRead()
  const staffUnread = useStaffUnreadCounts()
  const appealUnread = staffUnread.data?.appeals ?? 0
  const rows = queue.data ?? []
  const hasNext = rows.length >= PAGE_SIZE

  // Same behaviour as the Reports tab for consistency: clear once when the
  // moderator opens the tab, then let the badge re-arm and persist on new
  // arrivals until the tab is opened again.
  const markedReadRef = useRef(false)
  useEffect(() => {
    if (queueLoaded && !markedReadRef.current) {
      markedReadRef.current = true
      markAppealRead('appeal_new')
    }
  }, [queueLoaded, markAppealRead])

  // Newest-first means a new appeal is at the top of page 1, so refresh when an
  // `appeal_new` arrives (the badge count increases) to show it without a manual
  // reload. Only the newest-first view surfaces it on the current page; in
  // oldest-first a new appeal lands at the end.
  const prevAppealUnreadRef = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevAppealUnreadRef.current
    prevAppealUnreadRef.current = appealUnread
    if (prev === null || !queueLoaded) return
    if (order === 'desc' && appealUnread > prev) void refetchQueue()
  }, [appealUnread, queueLoaded, refetchQueue, order])

  return (
    <div className="space-y-6">
      <header className="space-y-4 pt-2">
        <div>
          <h1 className="font-display text-3xl font-semibold text-on-surface">Appeals</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Restricted accounts asking to have a decision reconsidered, {order === 'desc' ? 'newest first' : 'oldest first'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-pill border border-outline-variant/60 bg-surface p-1">
            {(['submitted', 'resolved', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatus(s)
                  setPage(1)
                }}
                aria-pressed={status === s}
                className={cn(
                  'rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
                  status === s ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {s === 'all' ? 'All' : APPEAL_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-on-surface-variant">Sort</span>
            <div role="group" aria-label="Appeal order" className="flex gap-1 rounded-pill border border-outline-variant/60 bg-surface p-1">
              {(['desc', 'asc'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => {
                    setOrder(o)
                    setPage(1)
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
          <p className="text-sm font-semibold text-error">Couldn’t load the appeal queue.</p>
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
          <MessageSquareWarning className="mx-auto h-7 w-7 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">
            No {status === 'all' ? '' : APPEAL_STATUS_LABELS[status].toLowerCase()} appeals right now.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft transition-colors hover:border-primary/40 hover:bg-primary-container/5"
              >
                <Link to={`./${row.id}`} className="block">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-on-surface">
                      {row.display_name ?? 'Deleted account'}
                    </span>
                    <span className="shrink-0 text-xs text-on-surface-variant">{timeAgo(row.created_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{row.details}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-pill bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
                      {APPEAL_STATUS_LABELS[row.status]}
                    </span>
                    <span className="rounded-pill bg-surface-container px-2.5 py-1 text-xs font-semibold capitalize text-on-surface-variant">
                      {row.appealed_status === 'suspended' ? 'suspended' : 'banned'}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
            <span>
              Page {page}
              {hasNext
                ? ` · ${order === 'desc' ? 'older' : 'newer'} appeals available`
                : ''}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-pill border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNext}
                className="rounded-pill border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
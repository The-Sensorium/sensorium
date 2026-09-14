import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Loader2, MessageSquareWarning } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { cn } from '../../lib/utils'
import {
  APPEAL_STATUS_LABELS,
  isAppealOverdue,
  useAppealsPageV2,
  useClaimAppeal,
  type AppealStatus,
  type QueueOrder,
} from '../../features/appeals'
import { formatError } from '../../features/admin-moderation'
import {
  timeAgo,
  useMarkStaffNotificationsRead,
  useStaffUnreadCounts,
} from '../../features/notifications'

const TABS = [
  { key: 'unassigned', label: 'Unassigned', params: { assignee: 'unassigned', sla: 'open' } },
  { key: 'mine', label: 'Assigned to me', params: { assignee: 'mine', sla: 'all' } },
  { key: 'overdue', label: 'Overdue', params: { sla: 'overdue' } },
  { key: 'open', label: 'All open', params: { sla: 'open' } },
  { key: 'closed', label: 'Closed', params: { sla: 'closed' } },
] as const

type TabKey = (typeof TABS)[number]['key']

export function AdminAppealsPage() {
  useDocumentTitle('Appeals')
  const [activeTab, setActiveTab] = useState<TabKey>('open')
  const [order, setOrder] = useState<QueueOrder>('desc')
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimMessage, setClaimMessage] = useState<string | null>(null)

  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[3]
  const status: AppealStatus = tab.key === 'closed' ? 'resolved' : 'submitted'
  const queue = useAppealsPageV2({
    status,
    assignee: 'assignee' in tab.params ? tab.params.assignee : undefined,
    sla: tab.params.sla,
    order,
  })
  const { refetch: refetchQueue, isSuccess: queueLoaded } = queue
  const claim = useClaimAppeal()
  const { mutate: markAppealRead } = useMarkStaffNotificationsRead()
  const staffUnread = useStaffUnreadCounts()
  const appealUnread = staffUnread.data?.appeals ?? 0

  const rows = queue.data?.pages.flat() ?? []

  const markedReadRef = useRef(false)
  useEffect(() => {
    if (queueLoaded && !markedReadRef.current) {
      markedReadRef.current = true
      markAppealRead('appeal_new')
    }
  }, [queueLoaded, markAppealRead])

  const prevAppealUnreadRef = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevAppealUnreadRef.current
    prevAppealUnreadRef.current = appealUnread
    if (prev === null || !queueLoaded) return
    if (order === 'desc' && appealUnread > prev) void refetchQueue()
  }, [appealUnread, queueLoaded, refetchQueue, order])

  function selectTab(key: TabKey) {
    setActiveTab(key)
    setClaimError(null)
    setClaimMessage(null)
  }

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
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => selectTab(t.key)}
                aria-pressed={activeTab === t.key}
                data-e2e={`appeal-tab-${t.key}`}
                className={cn(
                  'rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
                  activeTab === t.key ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {t.label}
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
                  onClick={() => setOrder(o)}
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
        <div className="rounded-lg border border-error/30 bg-error/10 p-10 text-center">
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
        <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
          <MessageSquareWarning className="mx-auto h-7 w-7 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">No appeals match this view right now.</p>
        </div>
      ) : (
        <>
          {claimError && <p role="alert" className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">{claimError}</p>}
          {claimMessage && <p role="status" className="rounded-md border border-primary/30 bg-primary-container/10 p-3 text-sm text-on-surface">{claimMessage}</p>}
          <ul className="space-y-3">
            {rows.map((row) => {
              const overdue = isAppealOverdue(row.review_due_at, row.status)
              return (
              <li
                key={row.id}
                data-e2e="appeal-row"
                className="flex flex-col gap-3 rounded-lg border border-outline-variant/60 bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-primary-container/5 sm:flex-row sm:items-center"
              >
                <Link to={`./${row.id}`} className="block min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-on-surface">
                      {row.display_name ?? 'Deleted account'}
                    </span>
                    <span className="shrink-0 text-xs text-on-surface-variant">{timeAgo(row.created_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{row.snippet}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-surface-container px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                      {APPEAL_STATUS_LABELS[row.status]}
                    </span>
                    <span className="rounded-md bg-surface-container px-2 py-0.5 text-xs font-semibold capitalize text-on-surface-variant">
                      {row.appealed_status}
                    </span>
                    {row.assigned_to_display_name && (
                      <span className="rounded-md bg-surface-container px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                        {row.assigned_to_display_name}
                      </span>
                    )}
                    {overdue && (
                      <span className="rounded-md bg-error/10 px-2 py-0.5 text-[11px] font-semibold text-error">
                        Overdue
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex shrink-0 items-center justify-between gap-2 border-t border-outline-variant/50 pt-3 sm:border-t-0 sm:pt-0">
                  {row.status === 'submitted' && !row.assigned_to ? (
                    <button
                      type="button"
                      disabled={claim.isPending}
                      onClick={() => {
                        setClaimError(null)
                        setClaimMessage(null)
                        void claim.mutateAsync({ p_appeal_id: row.id })
                          .then(() => setClaimMessage('Appeal claimed successfully.'))
                          .catch((error) => setClaimError(formatError(error)))
                      }}
                      className="rounded-md border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
                    >
                      Claim
                    </button>
                  ) : null}
                </div>
              </li>
              )
            })}
          </ul>
          <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
            <span>
              {rows.length} appeal{rows.length === 1 ? '' : 's'} shown
              {queue.hasNextPage &&
                (queue.isFetchingNextPage
                  ? ` · loading ${order === 'desc' ? 'older' : 'newer'}…`
                  : ` · ${order === 'desc' ? 'older' : 'newer'} appeals available`)}
            </span>
            {queue.hasNextPage && !queue.isFetchingNextPage && (
              <button
                type="button"
                onClick={() => void queue.fetchNextPage()}
                className="rounded-pill border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
              >
                Load {order === 'desc' ? 'older' : 'newer'} appeals
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

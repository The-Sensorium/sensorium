import { useState } from 'react'
import { Link } from 'react-router'
import { Loader2, MessageSquareWarning } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { cn } from '../../lib/utils'
import { APPEAL_STATUS_LABELS, useAdminAppeals, type AppealStatus } from '../../features/appeals'
import { timeAgo } from '../../features/notifications'

const PAGE_SIZE = 25

export function AdminAppealsPage() {
  useDocumentTitle('Appeals')
  const [status, setStatus] = useState<AppealStatus | 'all'>('submitted')
  const [page, setPage] = useState(1)
  const queue = useAdminAppeals({ status, page, pageSize: PAGE_SIZE })
  const rows = queue.data ?? []
  const hasNext = rows.length >= PAGE_SIZE

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="font-display text-3xl font-semibold text-on-surface">Appeals</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Restricted accounts asking to have a decision reconsidered.</p>
        </div>
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
              {hasNext ? ' · older appeals available' : ''}
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
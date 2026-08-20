import { useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, ScrollText } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { useModerationAudit } from '../../features/admin-moderation'
import { timeAgo } from '../../features/notifications'

export function ModerationAuditPage() {
  useDocumentTitle('Moderation audit')
  const audit = useModerationAudit(100)
  const rows = audit.data?.pages.flat() ?? []
  const [actionFilter, setActionFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'older'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const actionOptions = Array.from(new Set(rows.map((row) => row.action)))
  const now = Date.now()
  const filteredRows = rows.filter((row) => {
    const matchesAction = actionFilter === 'all' || row.action === actionFilter
    const matchesSearch = `${row.actor_display_name ?? ''} ${row.target_display_name ?? ''} ${row.reason ?? ''} ${row.action}`
      .toLowerCase()
      .includes(search.toLowerCase())
    const age = now - new Date(row.created_at).getTime()
    const matchesDate =
      dateFilter === 'all' ||
      (dateFilter === 'today' && age <= 86_400_000) ||
      (dateFilter === 'week' && age <= 7 * 86_400_000) ||
      (dateFilter === 'older' && age > 7 * 86_400_000)
    return matchesAction && matchesSearch && matchesDate
  })
  const pageSize = 25
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const visibleRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <h1 className="font-display text-3xl font-semibold text-on-surface">Moderation audit</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Append-only record of staff actions across the platform.</p>
      </header>

      <section aria-label="Audit filters" className="grid gap-2 rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft sm:grid-cols-[1fr_auto_auto]">
        <label className="block text-xs font-semibold text-on-surface">
          Search
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
            placeholder="Actor, target, reason..."
            className="mt-1.5 w-full rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block text-xs font-semibold text-on-surface">
          Action
          <select
            value={actionFilter}
            onChange={(event) => {
              setActionFilter(event.target.value)
              setPage(0)
            }}
            className="mt-1.5 w-full rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface focus:border-primary focus:outline-none"
          >
            <option value="all">All actions</option>
            {actionOptions.map((action) => <option key={action} value={action}>{action.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-on-surface">
          Date
          <select
            value={dateFilter}
            onChange={(event) => {
              setDateFilter(event.target.value as typeof dateFilter)
              setPage(0)
            }}
            className="mt-1.5 w-full rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface focus:border-primary focus:outline-none"
          >
            <option value="all">Any time</option>
            <option value="today">Last 24 hours</option>
            <option value="week">Last 7 days</option>
            <option value="older">Older than 7 days</option>
          </select>
        </label>
      </section>

      {audit.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : audit.isError ? (
        <div className="rounded-2xl border border-error/30 bg-error/10 p-10 text-center">
          <p className="text-sm font-semibold text-error">Couldn’t load the audit log.</p>
          <button
            type="button"
            onClick={() => void audit.refetch()}
            className="mt-4 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            Try Again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
          <ScrollText className="mx-auto h-7 w-7 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">No audit entries yet.</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
          <ScrollText className="mx-auto h-7 w-7 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">No entries match these filters.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
            <span>{filteredRows.length} entr{filteredRows.length === 1 ? 'y' : 'ies'}</span>
            {pageCount > 1 && <span>Page {page + 1} of {pageCount}</span>}
          </div>
          <ul className="space-y-2">
          {visibleRows.map((row) => (
            <li key={row.id}>
              <div className="flex items-start gap-4 rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-container text-on-surface-variant">
                  <ScrollText className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-on-surface">
                    <span className="capitalize">{row.action.replace(/_/g, ' ')}</span>{' '}
                    <span className="font-normal text-on-surface-variant">by {row.actor_display_name || 'unknown'}</span>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-on-surface-variant">
                    {row.target_user_id ? `target: ${row.target_display_name || row.target_user_id}` : ''} · {row.reason}
                  </p>
                  <p className="mt-1 text-xs text-on-surface-variant">{timeAgo(row.created_at)}</p>
                </div>
              </div>
            </li>
          ))}
          </ul>
          {audit.hasNextPage && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void audit.fetchNextPage()}
                disabled={audit.isFetchingNextPage}
                className="inline-flex items-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                {audit.isFetchingNextPage ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4 rotate-90" aria-hidden />
                )}
                {audit.isFetchingNextPage ? 'Loading…' : 'Load older entries'}
              </button>
            </div>
          )}
          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(0, value - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1 rounded-pill border border-outline-variant/60 px-3 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Previous
              </button>
              <span className="text-xs text-on-surface-variant">Page {page + 1} of {pageCount}</span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                disabled={page === pageCount - 1}
                className="inline-flex items-center gap-1 rounded-pill border border-outline-variant/60 px-3 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

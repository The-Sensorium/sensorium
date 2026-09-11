import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowRight, ChevronRight, Download, Loader2, ScrollText, X } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import {
  auditRowsToCsv,
  useModerationAuditV2,
  type ModerationActionType,
  type ModerationAuditV2Row,
} from '../../features/admin-moderation'
import { Constants } from '../../lib/database.types'
import { timeAgo } from '../../features/notifications'

const ACTION_OPTIONS = Constants.public.Enums.moderation_action_type as readonly string[]
const EXPORT_CAP = 1000

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function MetadataView({ metadata }: { metadata: unknown }) {
  if (metadata == null || (typeof metadata === 'object' && Object.keys(metadata).length === 0)) {
    return <p className="text-sm text-on-surface-variant">No metadata recorded.</p>
  }
  if (typeof metadata !== 'object') {
    return (
      <p className="rounded-md bg-surface-container/60 p-3 text-sm text-on-surface">
        {formatMetadataValue(metadata)}
      </p>
    )
  }
  return (
    <dl className="space-y-2">
      {Object.entries(metadata).map(([key, value]) => {
        const label = key.replace(/_/g, ' ')
        return (
          <div key={key} className="flex justify-between gap-3 rounded-md bg-surface-container/60 px-3 py-2 text-sm">
            <dt className="shrink-0 font-medium text-on-surface-variant">{label.charAt(0).toUpperCase() + label.slice(1)}</dt>
            <dd className="break-all text-right font-medium text-on-surface" title={typeof value === 'string' ? value : undefined}>
              {formatMetadataValue(value)}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function AuditDetailDrawer({ row, onClose, staffBase }: { row: ModerationAuditV2Row; onClose: () => void; staffBase: string }) {
  return (
    <>
      <button type="button" aria-label="Dismiss details" onClick={onClose} className="fixed inset-0 z-30 cursor-default bg-black/20" />
      <aside
        role="dialog"
        aria-label="Audit entry details"
        className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-outline-variant/60 bg-surface p-5 shadow-lift"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold capitalize text-on-surface">{row.action.replace(/_/g, ' ')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="grid h-8 w-8 place-items-center rounded-pill text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-on-surface-variant">When</dt>
            <dd className="font-medium text-on-surface">{timeAgo(row.created_at)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-on-surface-variant">Actor</dt>
            <dd className="font-medium text-on-surface">{row.actor_display_name ?? row.actor_id ?? 'System'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-on-surface-variant">Target</dt>
            <dd className="font-medium text-on-surface">
              {row.target_user_id ? (
                <Link to={`${staffBase}/accounts/${row.target_user_id}`} className="font-semibold text-primary">
                  {row.target_display_name ?? row.target_user_id}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-on-surface-variant">Reason</dt>
            <dd className="max-w-56 truncate font-medium text-on-surface" title={row.reason}>{row.reason}</dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {row.report_id && (
            <Link
              to={`${staffBase}/reports/${row.report_id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
            >
              Open case
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            </Link>
          )}
          {row.appeal_id && staffBase === '/admin' && (
            <Link
              to={`/admin/appeals/${row.appeal_id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
            >
              Open appeal
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            </Link>
          )}
        </div>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Metadata</h3>
        <div className="mt-2">
          <MetadataView metadata={row.metadata} />
        </div>
      </aside>
    </>
  )
}

export function ModerationAuditPage() {
  useDocumentTitle('Moderation audit')
  const { pathname } = useLocation()
  const staffBase = pathname.startsWith('/moderator') ? '/moderator' : '/admin'

  const [action, setAction] = useState<ModerationActionType | ''>('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [actorId, setActorId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [reportId, setReportId] = useState('')
  const [appealId, setAppealId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    if (searchInput === search) return
    const timer = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput, search])

  const audit = useModerationAuditV2(
    {
      action: action || undefined,
      actorId,
      targetId,
      reportId,
      appealId,
      dateFrom,
      dateTo,
      search,
    },
    100,
  )
  const rows = audit.data?.pages.flat() ?? []
  const selected = rows.find((row) => row.id === selectedId) ?? null

  async function exportCsv() {
    setExporting(true)
    setExportError(null)
    try {
      let collected = rows
      let guard = 0
      while (audit.hasNextPage && collected.length < EXPORT_CAP && guard < 10) {
        guard += 1
        const result = await audit.fetchNextPage()
        collected = (result.data?.pages.flat() ?? collected) as ModerationAuditV2Row[]
      }
      const csv = auditRowsToCsv(collected.slice(0, EXPORT_CAP))
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `moderation-audit-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportError('Export failed. Try narrowing the filters first.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="font-display text-3xl font-semibold text-on-surface">Moderation audit</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Append-only record of staff actions across the platform.</p>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting || rows.length === 0}
          className="inline-flex items-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </header>
      {exportError && <p role="alert" className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">{exportError}</p>}

      <section aria-label="Audit filters" className="grid gap-2 rounded-lg border border-outline-variant/60 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-semibold text-on-surface">
          Search
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Actor, target, reason..."
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block text-xs font-semibold text-on-surface">
          Action
          <select
            value={action}
            onChange={(event) => setAction(event.target.value as ModerationActionType | '')}
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface focus:border-primary focus:outline-none"
          >
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((option) => (
              <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-on-surface">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block text-xs font-semibold text-on-surface">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block text-xs font-semibold text-on-surface">
          Actor id
          <input
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
            placeholder="UUID…"
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block text-xs font-semibold text-on-surface">
          Target id
          <input
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            placeholder="UUID…"
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block text-xs font-semibold text-on-surface">
          Report id
          <input
            value={reportId}
            onChange={(event) => setReportId(event.target.value)}
            placeholder="UUID…"
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block text-xs font-semibold text-on-surface">
          Appeal id
          <input
            value={appealId}
            onChange={(event) => setAppealId(event.target.value)}
            placeholder="UUID…"
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
          />
        </label>
      </section>

      {audit.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : audit.isError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 p-10 text-center">
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
        <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
          <ScrollText className="mx-auto h-7 w-7 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">No entries match these filters.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-xs text-on-surface-variant">
            <span>{rows.length} entr{rows.length === 1 ? 'y' : 'ies'} shown</span>
          </div>
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  data-e2e="audit-row"
                  className="flex w-full items-start gap-4 rounded-lg border border-outline-variant/60 bg-surface p-4 text-left transition-colors hover:border-primary/40"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-container text-on-surface-variant">
                    <ScrollText className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-on-surface">
                      <span className="capitalize">{row.action.replace(/_/g, ' ')}</span>{' '}
                      <span className="font-normal text-on-surface-variant">by {row.actor_display_name || 'unknown'}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-on-surface-variant">
                      {row.target_user_id ? `target: ${row.target_display_name || row.target_user_id}` : ''} · {row.reason}
                    </span>
                    <span className="mt-1 block text-xs text-on-surface-variant">{timeAgo(row.created_at)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 self-center text-on-surface-variant" aria-hidden />
                </button>
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
        </>
      )}

      {selected && (
        <AuditDetailDrawer row={selected} onClose={() => setSelectedId(null)} staffBase={staffBase} />
      )}
    </div>
  )
}

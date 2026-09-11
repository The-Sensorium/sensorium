import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Flag, Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { cn } from '../../lib/utils'
import {
  MODERATION_SEVERITY_LABELS,
  REPORT_STATUS_LABELS,
  TARGET_KIND_LABELS,
  formatError,
  isBreached,
  useClaimReport,
  useModerationQueueV2,
  type ModerationSeverity,
  type QueueOrder,
  type ReportReason,
  type ReportStatus,
  type TargetKind,
} from '../../features/admin-moderation'
import {
  timeAgo,
  useMarkStaffNotificationsRead,
  useStaffUnreadCounts,
} from '../../features/notifications'
import { useStaffBase } from '../../features/admin-accounts'

const TABS = [
  { key: 'unassigned', label: 'Unassigned', params: { assignee: 'unassigned', sla: 'open' } },
  { key: 'mine', label: 'Assigned to me', params: { assignee: 'mine', sla: 'open' } },
  { key: 'breached', label: 'Overdue', params: { sla: 'breached' } },
  { key: 'open', label: 'All open', params: { sla: 'open' } },
  { key: 'closed', label: 'Closed', params: { sla: 'closed' } },
] as const

type TabKey = (typeof TABS)[number]['key']

function tabForParams(searchParams: URLSearchParams): TabKey {
  const assignee = searchParams.get('assignee') ?? 'all'
  const sla = searchParams.get('sla') ?? 'open'
  if (assignee === 'unassigned') return 'unassigned'
  if (assignee === 'mine') return 'mine'
  if (sla === 'breached') return 'breached'
  if (sla === 'closed') return 'closed'
  return 'open'
}

const REASONS: ReportReason[] = ['harassment', 'hate_speech', 'spam', 'inappropriate_content', 'other']
const SEVERITIES: ModerationSeverity[] = ['urgent', 'high', 'medium', 'low']
const KINDS: TargetKind[] = ['member', 'message', 'post', 'comment']
const STATUSES: ReportStatus[] = ['pending', 'reviewing', 'actioned', 'dismissed']
const SLAS = ['breached', 'open', 'closed', 'all'] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value != null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

function parseAssignee(value: string | null): string {
  if (value === 'unassigned' || value === 'mine') return value
  if (value != null && UUID_RE.test(value)) return value
  return 'all'
}

export function ModerationQueuePage() {
  useDocumentTitle('Report queue')
  const [searchParams, setSearchParams] = useSearchParams()
  const staffBase = useStaffBase()
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimMessage, setClaimMessage] = useState<string | null>(null)

  const status = oneOf(searchParams.get('status'), STATUSES)
  const assignee = parseAssignee(searchParams.get('assignee'))
  const targetKind = oneOf(searchParams.get('target_kind'), KINDS)
  const reason = oneOf(searchParams.get('reason'), REASONS)
  const severity = oneOf(searchParams.get('severity'), SEVERITIES)
  const sla = oneOf(searchParams.get('sla'), SLAS) ?? 'open'
  const search = searchParams.get('search') ?? ''
  const order: QueueOrder = searchParams.get('order') === 'asc' ? 'asc' : 'desc'
  const activeTab = tabForParams(searchParams)

  const [searchInput, setSearchInput] = useState(search)
  useEffect(() => {
    setSearchInput(search)
  }, [search])
  useEffect(() => {
    if (searchInput === search) return
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      if (searchInput) next.set('search', searchInput)
      else next.delete('search')
      setSearchParams(next, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, search, searchParams, setSearchParams])

  const queue = useModerationQueueV2(
    { status, assignee, targetKind, reason, severity, sla, search, order },
  )
  const { refetch: refetchQueue, isSuccess: queueLoaded } = queue
  const claim = useClaimReport()
  const { mutate: markReportRead } = useMarkStaffNotificationsRead()
  const staffUnread = useStaffUnreadCounts()
  const reportUnread = staffUnread.data?.reports ?? 0

  const rows = queue.data?.pages.flat() ?? []

  const markedReadRef = useRef(false)
  useEffect(() => {
    if (queueLoaded && !markedReadRef.current) {
      markedReadRef.current = true
      markReportRead('report_new')
    }
  }, [queueLoaded, markReportRead])

  const prevReportUnreadRef = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevReportUnreadRef.current
    prevReportUnreadRef.current = reportUnread
    if (prev === null || !queueLoaded) return
    if (order === 'desc' && reportUnread > prev) void refetchQueue()
  }, [reportUnread, queueLoaded, refetchQueue, order])

  function update(params: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(params)) {
      if (!value) next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next, { replace: true })
    setClaimError(null)
    setClaimMessage(null)
  }

  function selectTab(key: TabKey) {
    const tab = TABS.find((t) => t.key === key)
    if (!tab) return
    const next = new URLSearchParams(searchParams)
    next.delete('status')
    if (key === 'closed') next.delete('assignee')
    else if (tab.params && 'assignee' in tab.params) next.set('assignee', tab.params.assignee)
    else next.delete('assignee')
    next.set('sla', tab.params.sla)
    setSearchParams(next, { replace: true })
    setClaimError(null)
    setClaimMessage(null)
  }

  return (
    <div className="space-y-6">
      <header className="space-y-4 pt-2">
        <div>
          <h1 className="font-display text-3xl font-semibold text-on-surface">Report queue</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Triage by assignment, severity, content type, and SLA, {order === 'desc' ? 'newest first' : 'oldest first'}.
          </p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-pill border border-outline-variant/60 bg-surface p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              aria-pressed={activeTab === tab.key}
              data-e2e={`queue-tab-${tab.key}`}
              className={cn(
                'rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
                activeTab === tab.key ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5">
            <span className="font-medium text-on-surface-variant">Status</span>
            <select
              aria-label="Status filter"
              value={status ?? ''}
              onChange={(e) => update({ status: e.target.value || undefined })}
              className="rounded-lg border border-outline-variant/60 bg-surface px-2.5 py-1.5 font-semibold text-on-surface"
            >
              <option value="">All</option>
              {(['pending', 'reviewing', 'actioned', 'dismissed'] as const).map((s) => (
                <option key={s} value={s}>{REPORT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="font-medium text-on-surface-variant">Type</span>
            <select
              aria-label="Content type filter"
              value={targetKind ?? ''}
              onChange={(e) => update({ target_kind: e.target.value || undefined })}
              className="rounded-lg border border-outline-variant/60 bg-surface px-2.5 py-1.5 font-semibold text-on-surface"
            >
              <option value="">All</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>{TARGET_KIND_LABELS[k]}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="font-medium text-on-surface-variant">Reason</span>
            <select
              aria-label="Reason filter"
              value={reason ?? ''}
              onChange={(e) => update({ reason: e.target.value || undefined })}
              className="rounded-lg border border-outline-variant/60 bg-surface px-2.5 py-1.5 font-semibold text-on-surface"
            >
              <option value="">All</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="font-medium text-on-surface-variant">Severity</span>
            <select
              aria-label="Severity filter"
              value={severity ?? ''}
              onChange={(e) => update({ severity: e.target.value || undefined })}
              className="rounded-lg border border-outline-variant/60 bg-surface px-2.5 py-1.5 font-semibold text-on-surface"
            >
              <option value="">All</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{MODERATION_SEVERITY_LABELS[s]}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="font-medium text-on-surface-variant">Search</span>
            <input
              aria-label="Queue search"
              value={searchInput}
              placeholder="Member, cluster, details…"
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-44 rounded-lg border border-outline-variant/60 bg-surface px-2.5 py-1.5 font-medium text-on-surface"
            />
          </label>
          <div role="group" aria-label="Report order" className="flex gap-1 rounded-pill border border-outline-variant/60 bg-surface p-1">
            {(['desc', 'asc'] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => update({ order: o })}
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
      </header>

      {queue.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        </div>
      ) : queue.isError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 p-10 text-center">
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
        <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
          <Flag className="mx-auto h-7 w-7 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">No reports match these filters right now.</p>
        </div>
      ) : (
        <>
          {claimError && <p role="alert" className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">{claimError}</p>}
          {claimMessage && <p role="status" className="rounded-md border border-primary/30 bg-primary-container/10 p-3 text-sm text-on-surface">{claimMessage}</p>}
          <ul className="space-y-3">
          {rows.map((row) => {
            const breached = isBreached(row.due_at, row.status)
            return (
            <li key={row.id} data-e2e="report-row" className="flex flex-col gap-3 rounded-lg border border-outline-variant/60 bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-primary-container/5 sm:flex-row sm:items-center">
              <Link
                to={`./${row.id}`}
                className="flex min-w-0 flex-1 items-start gap-4 text-left"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-container text-on-surface-variant">
                  <Flag className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-on-surface">
                      {row.reason.replace(/_/g, ' ')}: {row.target_display_name ?? 'Unknown member'}
                    </span>
                    <span className="shrink-0 text-xs text-on-surface-variant">{timeAgo(row.created_at)}</span>
                  </span>
                  <span className="mt-1 block text-sm text-on-surface-variant">
                    {row.cluster_name} · {row.snippet ? row.snippet : 'no details'}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      title="What was reported: a member, a chat message, a post, or a comment."
                      className="rounded-md bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant"
                    >
                      {TARGET_KIND_LABELS[(row.target_kind as TargetKind) ?? 'member'] ?? row.target_kind}
                    </span>
                    <span
                      title="Triage severity, drives the SLA: urgent 4 hours, high 24 hours, medium 72 hours, low 7 days."
                      className="rounded-md bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant"
                    >
                      {MODERATION_SEVERITY_LABELS[(row.severity as ModerationSeverity) ?? 'medium'] ?? row.severity} severity
                    </span>
                    {breached && (
                      <span className="rounded-pill bg-error/10 px-2 py-0.5 text-[11px] font-semibold text-error">
                        SLA breached
                      </span>
                    )}
                    {row.duplicate_open_reports > 0 && (
                      <span className="rounded-md bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                        +{row.duplicate_open_reports} duplicate{row.duplicate_open_reports === 1 ? '' : 's'}
                      </span>
                    )}
                    {row.prior_target_reports > 0 && (
                      <span className="rounded-md bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                        {row.prior_target_reports} prior report{row.prior_target_reports === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-outline-variant/50 pt-3 sm:border-t-0 sm:pt-0">
                <span className="rounded-md bg-surface-container px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                  {REPORT_STATUS_LABELS[row.status]}
                </span>
                {row.target_user_id ? (
                  <Link
                    to={`${staffBase}/accounts/${row.target_user_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-md border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
                  >
                    Account
                  </Link>
                ) : null}
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
            )
          })}
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


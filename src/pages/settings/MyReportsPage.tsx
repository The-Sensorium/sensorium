import { Link } from 'react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { REPORT_REASONS, useMyReports } from '../../features/moderation'
import { timeAgo } from '../../features/notifications'
import { cn } from '../../lib/utils'

const REASON_LABELS = new Map(REPORT_REASONS.map((r) => [r.value, r.label]))

const KIND_LABELS: Record<string, string> = {
  member: 'Member',
  message: 'Message',
  post: 'Post',
  comment: 'Comment',
}

function outcomeFor(status: string): string | null {
  if (status === 'actioned') return 'Reviewed — action taken.'
  if (status === 'dismissed') return 'Reviewed — no action taken.'
  return null
}

export function MyReportsPage() {
  useDocumentTitle('My reports')
  const reports = useMyReports()

  return (
    <div className="mx-auto max-w-xl space-y-6 pt-2">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Back to settings
      </Link>

      <header>
        <h1 className="font-display text-3xl font-semibold text-on-surface">My reports</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Reports you submitted.</p>
      </header>

      {reports.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : reports.isError ? (
        <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          Couldn’t load your reports. Please try again.
        </p>
      ) : (reports.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center text-sm text-on-surface-variant">
          No reports yet. Reports you submit appear here.
        </div>
      ) : (
        <ul className="space-y-3">
          {(reports.data ?? []).map((report) => {
            const outcome = outcomeFor(report.status)
            const open = report.status === 'pending' || report.status === 'reviewing'
            return (
              <li
                key={report.id}
                data-e2e="my-report-row"
                className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-on-surface">
                    {report.target_display_name
                      ? `${report.target_display_name} · ${KIND_LABELS[report.target_kind] ?? report.target_kind}`
                      : `${KIND_LABELS[report.target_kind] ?? report.target_kind} report`}
                  </p>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium',
                      open ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant',
                    )}
                  >
                    {report.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {report.cluster_name} · {REASON_LABELS.get(report.reason) ?? report.reason} · {timeAgo(report.created_at)}
                </p>
                {report.details && (
                  <p className="mt-1 text-sm italic leading-5 text-on-surface-variant">“{report.details}”</p>
                )}
                {outcome && <p className="mt-1 text-sm text-on-surface-variant">{outcome}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

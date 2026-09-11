import { Link } from 'react-router'
import { Megaphone } from 'lucide-react'
import type { ReporterSummary } from '../../../features/admin-moderation'

function accountAge(createdAt: string | null): string {
  if (!createdAt) return 'Unknown'
  const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
  if (days < 1) return 'Less than a day'
  if (days === 1) return '1 day'
  if (days < 30) return `${days} days`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month' : `${months} months`
}

export function ReporterPanel({ reporter, accountHref }: { reporter: ReporterSummary; accountHref?: string | null }) {
  const dismissedRatio =
    reporter.total_reports > 0 ? Math.round((reporter.dismissed_reports / reporter.total_reports) * 100) : null

  return (
    <div className="rounded-lg border border-outline-variant/60 bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
        <Megaphone className="h-4 w-4 text-primary" strokeWidth={1.5} aria-hidden />
        Reporter
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Member</dt>
          <dd className="font-medium text-on-surface">
            {accountHref ? (
              <Link to={accountHref} className="font-semibold text-primary">
                {reporter.display_name ?? 'Deleted account'}
              </Link>
            ) : (
              (reporter.display_name ?? 'Deleted account')
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Account age</dt>
          <dd className="font-medium text-on-surface">{accountAge(reporter.account_created_at)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Reports · 30 days</dt>
          <dd className="font-medium text-on-surface">{reporter.reports_30d}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Dismissed ratio</dt>
          <dd className="font-medium text-on-surface">
            {dismissedRatio === null
              ? 'No reports filed'
              : `${reporter.dismissed_reports}/${reporter.total_reports} (${dismissedRatio}%)`}
          </dd>
        </div>
      </dl>
    </div>
  )
}

import { Link } from 'react-router'
import { ArrowRight, BellRing, Clock, Eye, Flag, Inbox, Loader2, MailWarning, Send, Timer, UserRound, type LucideIcon } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { timeAgo } from '../../features/notifications'
import { useMyAccess } from '../../features/access'
import { useAdminOpsHealth, useModerationQueueV2, useStaffModerationSummary } from '../../features/admin-moderation'

function heartbeatLabel(iso: string | null): string {
  if (!iso) return 'No successful run recorded'
  return `Last success ${timeAgo(iso)}`
}

export function StaffDashboardPage() {
  useDocumentTitle('Staff dashboard')
  const summary = useStaffModerationSummary()
  const urgent = useModerationQueueV2({ sla: 'open', severity: 'urgent', order: 'desc' }, 5)
  const urgentRows = urgent.data?.pages.flat() ?? []
  const access = useMyAccess()
  const isAdmin = access.data?.capabilities.includes('can_manage_roles') ?? false
  const ops = useAdminOpsHealth(isAdmin)
  const health = ops.data
  const data = summary.data

  if (summary.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  if (summary.isError || !data) {
    return (
      <div className="rounded-lg border border-error/30 bg-error/10 p-10 text-center">
        <p className="text-sm font-semibold text-error">Couldn’t load the dashboard.</p>
        <button
          type="button"
          onClick={() => void summary.refetch()}
          className="mt-4 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          Try Again
        </button>
      </div>
    )
  }

  const openCount = data.pending_count + data.reviewing_count

  const cards: { label: string; value: number; to: string; e2e: string; icon: LucideIcon }[] = [
    { label: 'Pending', value: data.pending_count, to: './reports?sla=open&status=pending', e2e: 'staff-stat-pending', icon: Inbox },
    { label: 'Reviewing', value: data.reviewing_count, to: './reports?sla=open&status=reviewing', e2e: 'staff-stat-reviewing', icon: Eye },
    { label: 'Assigned to me', value: data.assigned_to_me_count, to: './reports?assignee=mine', e2e: 'staff-stat-mine', icon: UserRound },
    { label: 'Unassigned', value: data.unassigned_open_count, to: './reports?assignee=unassigned', e2e: 'staff-stat-unassigned', icon: Clock },
    { label: 'Overdue', value: data.breached_open_count, to: './reports?sla=breached', e2e: 'staff-stat-breached', icon: Timer },
    { label: 'Urgent open', value: data.urgent_open_count, to: './reports?severity=urgent', e2e: 'staff-stat-urgent', icon: Flag },
  ]

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <h1 className="font-display text-3xl font-semibold text-on-surface">Staff dashboard</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {openCount === 1 ? '1 open report' : `${openCount} open reports`}
          {data.oldest_pending_at ? ` · oldest pending ${timeAgo(data.oldest_pending_at)}` : ''}
          {` · ${data.actioned_7d_count} actioned / ${data.dismissed_7d_count} dismissed in 7 days`}
          {data.appeals_submitted_count === 1
            ? ' · 1 appeal waiting'
            : data.appeals_submitted_count > 1
              ? ` · ${data.appeals_submitted_count} appeals waiting`
              : ''}.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            data-e2e={card.e2e}
            className="rounded-lg border border-outline-variant/60 bg-surface p-4 transition-colors hover:border-primary/40"
          >
            <p className="text-2xl font-semibold text-on-surface">{card.value}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
              <card.icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              {card.label}
            </p>
          </Link>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-on-surface">Urgent open cases</h2>
          <Link
            to="./reports?severity=urgent"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            Open queue
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </Link>
        </div>
        {urgent.isLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          </div>
        ) : urgent.isError ? (
          <div className="rounded-lg border border-error/30 bg-error/10 p-6 text-center">
            <p className="text-sm font-semibold text-error">Couldn’t load urgent cases.</p>
            <button
              type="button"
              onClick={() => void urgent.refetch()}
              className="mt-3 rounded-pill bg-primary px-5 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
            >
              Try Again
            </button>
          </div>
        ) : urgentRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-outline-variant bg-surface-container/40 p-6 text-center text-sm text-on-surface-variant">
            No urgent open cases.
          </p>
        ) : (
          <ul className="space-y-2">
            {urgentRows.map((row) => (
              <li key={row.id}>
                <Link
                  to={`./reports/${row.id}`}
                  data-e2e="staff-urgent-row"
                  className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant/60 bg-surface px-4 py-3 text-sm transition-colors hover:border-primary/40"
                >
                  <span className="truncate font-medium text-on-surface">
                    {row.reason.replace(/_/g, ' ')}: {row.target_display_name ?? 'Unknown member'}
                  </span>
                  <span className="shrink-0 text-xs text-on-surface-variant">{timeAgo(row.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-on-surface">Operations health</h2>
          {ops.isLoading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
            </div>
          ) : ops.isError || !health ? (
            <div className="rounded-lg border border-error/30 bg-error/10 p-6 text-center">
              <p className="text-sm font-semibold text-error">Couldn’t load operations health.</p>
              <button
                type="button"
                onClick={() => void ops.refetch()}
                className="mt-3 rounded-pill bg-primary px-5 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Emails queued', value: health.email_queued, icon: MailWarning, alert: health.email_queued > 50 },
                  { label: 'Emails failed · 24h', value: health.email_failed_24h, icon: MailWarning, alert: health.email_failed_24h > 0 },
                  { label: 'Push queued', value: health.push_queued, icon: Send, alert: health.push_queued > 50 },
                  { label: 'Push failed · 24h', value: health.push_failed_24h, icon: Send, alert: health.push_failed_24h > 0 },
                ].map((card) => (
                  <div
                    key={card.label}
                    data-e2e="ops-health-card"
                    className="rounded-lg border border-outline-variant/60 bg-surface p-4"
                  >
                    <p className={`text-2xl font-semibold ${card.alert ? 'text-error' : 'text-on-surface'}`}>{card.value}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                      <card.icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                      {card.label}
                    </p>
                  </div>
                ))}
              </div>
              {(health.email_stuck_sending > 0 || health.push_stuck_sending > 0 || health.email_abandoned > 0 || health.push_abandoned > 0) && (
                <p role="alert" className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
                  Stuck or abandoned deliveries need attention: {health.email_stuck_sending} emails stuck
                  , {health.push_stuck_sending} push stuck, {health.email_abandoned} emails and {health.push_abandoned} push abandoned.
                </p>
              )}
              <div className="rounded-lg border border-outline-variant/60 bg-surface p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                  <BellRing className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                  Scheduler
                </p>
                <ul className="mt-2 space-y-1 text-sm text-on-surface">
                  <li className="flex justify-between gap-3">
                    <span className="text-on-surface-variant">Email pump</span>
                    <span>{heartbeatLabel(health.last_email_pump_at)}</span>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span className="text-on-surface-variant">Push pump</span>
                    <span>{heartbeatLabel(health.last_push_pump_at)}</span>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span className="text-on-surface-variant">SLA watch</span>
                    <span>{heartbeatLabel(health.last_sla_watch_at)}</span>
                  </li>
                </ul>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}

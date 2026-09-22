import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Activity, ArrowRight, BellRing, ChartColumn, Clock, Eye, Flag, Inbox, Loader2, Mail, MailX, Send, Timer, TriangleAlert, UserRound, type LucideIcon } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { timeAgo } from '../../features/notifications'
import { useMyAccess } from '../../features/access'
import { useAdminOpsHealth, useModerationQueueV2, useStaffModerationSummary } from '../../features/admin-moderation'
import { useClusterActivity, useMetricsOverview, useModeBreakdown, useRetention, DEFAULT_ACTIVITY_LIMIT } from '../../features/metrics'

function heartbeatLabel(iso: string | null): string {
  if (!iso) return 'Never ran successfully'
  return timeAgo(iso)
}

function jobFresh(iso: string | null, staleAfterMs: number): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() <= staleAfterMs
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

function SectionCard({
  icon: Icon,
  title,
  caption,
  action,
  children,
}: {
  icon: LucideIcon
  title: string
  caption: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-outline-variant/60 bg-surface p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container text-primary">
            <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-on-surface">{title}</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">{caption}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function StaffDashboardPage() {
  useDocumentTitle('Staff dashboard')
  const summary = useStaffModerationSummary()
  const urgent = useModerationQueueV2({ sla: 'open', severity: 'urgent', order: 'desc' }, 5)
  const urgentRows = urgent.data?.pages.flat() ?? []
  const access = useMyAccess()
  const isAdmin = access.data?.capabilities.includes('can_manage_roles') ?? false
  const ops = useAdminOpsHealth(isAdmin)
  const metrics = useMetricsOverview(isAdmin)
  const retention = useRetention(isAdmin)
  const [metricsIntent, setMetricsIntent] = useState(false)
  const prefetchMetrics = isAdmin && metricsIntent
  useModeBreakdown(prefetchMetrics)
  useClusterActivity(DEFAULT_ACTIVITY_LIMIT, prefetchMetrics)
  useEffect(() => {
    if (isAdmin) void import('./MetricsPage').catch(() => {})
  }, [isAdmin])
  const retention30 = retention.data?.find((row) => row.cohort_days === 30)
  const metricsReady = metrics.data && !metrics.isError && !retention.isError
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

  const cards: { label: string; caption: string; value: number; to: string; e2e: string; icon: LucideIcon }[] = [
    { label: 'Pending', caption: 'Unclaimed reports', value: data.pending_count, to: './reports?sla=open&status=pending', e2e: 'staff-stat-pending', icon: Inbox },
    { label: 'Reviewing', caption: 'Claimed, in progress', value: data.reviewing_count, to: './reports?sla=open&status=reviewing', e2e: 'staff-stat-reviewing', icon: Eye },
    { label: 'Assigned to me', caption: 'Claimed by you', value: data.assigned_to_me_count, to: './reports?assignee=mine', e2e: 'staff-stat-mine', icon: UserRound },
    { label: 'Unassigned', caption: 'Waiting for a claim', value: data.unassigned_open_count, to: './reports?assignee=unassigned', e2e: 'staff-stat-unassigned', icon: Clock },
    { label: 'Overdue', caption: 'Past SLA deadline', value: data.breached_open_count, to: './reports?sla=breached', e2e: 'staff-stat-breached', icon: Timer },
    { label: 'Urgent open', caption: 'Highest severity', value: data.urgent_open_count, to: './reports?severity=urgent', e2e: 'staff-stat-urgent', icon: Flag },
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
            className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft transition-all duration-200 hover:border-primary/40 active:scale-[0.98]"
          >
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container text-primary">
                <card.icon className="h-4.5 w-4.5" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-on-surface">{card.label}</span>
                <span className="block truncate text-xs text-on-surface-variant">{card.caption}</span>
              </span>
            </span>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-on-surface">{compact.format(card.value)}</p>
          </Link>
        ))}
      </div>

      <SectionCard
        icon={Flag}
        title="Urgent open cases"
        caption="Highest severity first · top 5"
        action={
          <Link
            to="./reports?severity=urgent"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-all duration-200 hover:bg-primary-container active:scale-95"
          >
            Open queue
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </Link>
        }
      >
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
      </SectionCard>

      {isAdmin && metricsReady && (
        <SectionCard
          icon={ChartColumn}
          title="Success metrics"
          caption="Community health at a glance"
          action={
            <Link
              to="./metrics"
              data-e2e="staff-metrics-link"
              onMouseEnter={() => setMetricsIntent(true)}
              onFocus={() => setMetricsIntent(true)}
              onTouchStart={() => setMetricsIntent(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-all duration-200 hover:bg-primary-container active:scale-95"
            >
              Open metrics
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Active clusters', caption: 'Open rooms now', value: compact.format(metrics.data.active_clusters) },
              { label: 'Active today', caption: 'Message or call in 24h', value: compact.format(metrics.data.daily_active_clusters) },
              { label: 'Messages · 30d', caption: 'Across all clusters', value: compact.format(metrics.data.messages_30d) },
              {
                label: '30-day retention',
                caption: 'Cohorts still alive',
                value: retention30 ? `${Math.round(Number(retention30.rate) * 100)}%` : 'n/a',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                data-e2e="dashboard-metrics-stat"
                className="rounded-xl border border-outline-variant/60 bg-surface-container/40 p-3"
              >
                <p className="text-xl font-semibold tabular-nums text-on-surface">{stat.value}</p>
                <p className="mt-1 text-xs font-semibold text-on-surface">{stat.label}</p>
                <p className="text-xs text-on-surface-variant">{stat.caption}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {isAdmin && (
        <SectionCard
          icon={Activity}
          title="Operations health"
          caption="Delivery queues and background jobs"
        >
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Emails queued', value: health.email_queued, icon: Mail, alert: health.email_queued > 50 },
                  { label: 'Emails failed · 24h', value: health.email_failed_24h, icon: MailX, alert: health.email_failed_24h > 0 },
                  { label: 'Push queued', value: health.push_queued, icon: Send, alert: health.push_queued > 50 },
                  { label: 'Push failed · 24h', value: health.push_failed_24h, icon: TriangleAlert, alert: health.push_failed_24h > 0 },
                ].map((card) => (
                  <div
                    key={card.label}
                    data-e2e="ops-health-card"
                    className={`rounded-2xl border bg-surface-container/40 p-4 ${card.alert ? 'border-error/40' : 'border-outline-variant/60'}`}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.alert ? 'bg-error/10 text-error' : 'bg-surface text-primary'}`}>
                      <card.icon className="h-4.5 w-4.5" strokeWidth={1.5} aria-hidden />
                    </span>
                    <p className={`mt-3 text-2xl font-semibold tabular-nums ${card.alert ? 'text-error' : 'text-on-surface'}`}>{compact.format(card.value)}</p>
                    <p className="mt-1 text-xs font-semibold text-on-surface">{card.label}</p>
                  </div>
                ))}
              </div>
              {(health.email_stuck_sending > 0 || health.push_stuck_sending > 0 || health.email_abandoned > 0 || health.push_abandoned > 0) && (
                <p role="alert" className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
                  Stuck or abandoned deliveries need attention: {health.email_stuck_sending} emails stuck
                  , {health.push_stuck_sending} push stuck, {health.email_abandoned} emails and {health.push_abandoned} push abandoned.
                </p>
              )}
              <div className="rounded-xl border border-outline-variant/60 bg-surface-container/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                    <BellRing className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} aria-hidden />
                    Scheduler
                  </p>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Last success</p>
                </div>
                <ul className="mt-2 space-y-2 text-sm text-on-surface">
                  {[
                    { label: 'Email pump', at: health.last_email_pump_at, staleAfterMs: 10 * 60_000 },
                    { label: 'Push pump', at: health.last_push_pump_at, staleAfterMs: 10 * 60_000 },
                    { label: 'SLA watch', at: health.last_sla_watch_at, staleAfterMs: 60 * 60_000 },
                  ].map((job) => {
                    const fresh = jobFresh(job.at, job.staleAfterMs)
                    return (
                      <li key={job.label} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <span
                            title={fresh ? 'Running normally' : 'Stale or never ran'}
                            aria-label={fresh ? `${job.label} healthy` : `${job.label} stale`}
                            className={`h-2 w-2 rounded-full ${fresh ? 'bg-primary' : 'bg-error'}`}
                          />
                          {job.label}
                        </span>
                        <span className="tabular-nums text-on-surface-variant">{heartbeatLabel(job.at)}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}

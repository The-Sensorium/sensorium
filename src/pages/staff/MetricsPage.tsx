import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  Clock,
  History,
  Inbox,
  Info,
  Layers,
  Loader2,
  MessagesSquare,
  RefreshCw,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { timeAgo } from '../../features/notifications'
import { modeInfo, type MatchingMode } from '../../lib/modes'
import {
  useClusterActivity,
  useMetricsOverview,
  useModeBreakdown,
  useRetention,
} from '../../features/metrics'

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

const ACTIVITY_PAGE_SIZES = [50, 100, 200, 500]
const MAX_ACTIVITY_LIMIT = ACTIVITY_PAGE_SIZES[ACTIVITY_PAGE_SIZES.length - 1]

function formatWait(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  const totalHours = Math.round(hours)
  if (totalHours < 48) return `${totalHours}h`
  const days = Math.floor(totalHours / 24)
  if (days >= 30) return `${days}d`
  const remainder = totalHours % 24
  return remainder === 0 ? `${days}d` : `${days}d ${remainder}h`
}

// Snapshot days are UTC dates from Postgres. Format and compare in UTC so the
// displayed day never shifts for timezones west of UTC.
function formatDay(iso: string | null): string {
  if (!iso) return 'No messages yet'
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return (todayUtc - Date.UTC(y, m - 1, d)) / (24 * 3600 * 1000)
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-error/30 bg-error/10 p-6 text-center">
      <p className="text-sm font-semibold text-error">{message}</p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="mt-3 rounded-pill bg-primary px-5 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
      >
        Try Again
      </button>
    </div>
  )
}

function SectionLoading() {
  return (
    <div className="grid place-items-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
    </div>
  )
}

// modeInfo throws on values outside MATCHING_MODES (e.g. a mode added
// server-side before the frontend list updates, or a retired enum value on an
// old cluster). The dashboard degrades to the raw value instead of unmounting.
function modeDisplay(mode: string): { label: string; Icon: LucideIcon } {
  try {
    const info = modeInfo(mode as MatchingMode)
    return { label: info.label, Icon: info.icon }
  } catch {
    return { label: mode, Icon: Users }
  }
}

function InfoTip({ label, text, align = 'left' }: { label: string; text: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="group relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="rounded-full text-on-surface-variant transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Info className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-10 mt-1 w-48 rounded-lg border border-outline-variant/60 bg-surface-container p-2.5 text-left text-xs font-normal leading-5 normal-case tracking-normal text-on-surface shadow-soft transition-opacity duration-200 ${align === 'right' ? 'right-0' : 'left-0'} ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
      >
        {text}
      </span>
    </span>
  )
}

function SectionCard({
  icon: Icon,
  title,
  caption,
  children,
  label,
}: {
  icon: LucideIcon
  title: string
  caption: string
  children: ReactNode
  label: string
}) {
  return (
    <section aria-label={label} className="rounded-2xl border border-outline-variant/60 bg-surface p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container text-primary">
          <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-on-surface">{title}</h2>
          <p className="mt-0.5 text-xs text-on-surface-variant">{caption}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function MetricsPage() {
  useDocumentTitle('Metrics')
  const overview = useMetricsOverview()
  const retention = useRetention()
  const modes = useModeBreakdown()
  const [activityLimit, setActivityLimit] = useState(ACTIVITY_PAGE_SIZES[0])
  function showMoreActivity() {
    setActivityLimit((current) => {
      const next = ACTIVITY_PAGE_SIZES.find((size) => size > current)
      return next ?? MAX_ACTIVITY_LIMIT
    })
  }
  const activity = useClusterActivity(activityLimit)

  const retentionRows = retention.data ?? []
  const modeRows = modes.data ?? []
  const activityRows = activity.data ?? []
  const maxJoins = Math.max(1, ...modeRows.map((row) => row.queue_joins))

  // The trailing-30-day window stated as concrete dates, plus measured
  // freshness (not the cron promise): data_through_day goes stale visibly if
  // the rollup ever stops; last_rollup_at is null before the first run.
  const rangeEnd = new Date()
  const rangeStart = new Date(rangeEnd.getTime() - 29 * 24 * 3600 * 1000)
  const shortDate = (d: Date) =>
    d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  // Manual refresh confirmation: after a successful refetch the badge reads
  // "Updated just now" (aging into a relative time), proving the click did
  // something even when the nightly numbers did not move.
  const [manualRefreshAt, setManualRefreshAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    if (manualRefreshAt === null) return
    const id = window.setInterval(() => setNowTick(Date.now()), 15000)
    return () => window.clearInterval(id)
  }, [manualRefreshAt])

  let freshness: string | null = null
  if (manualRefreshAt !== null) {
    freshness =
      nowTick - manualRefreshAt < 60_000
        ? 'Updated just now'
        : `Updated ${timeAgo(new Date(manualRefreshAt).toISOString())}`
  } else if (!overview.data) {
    freshness = null
  } else if (overview.data.last_rollup_at) {
    freshness = `Updated ${timeAgo(overview.data.last_rollup_at)}`
  } else if (overview.data.data_through_day) {
    freshness = `Data through ${formatDay(overview.data.data_through_day)}`
  } else {
    freshness = 'Awaiting first rollup'
  }

  // Minimum visible time for the refreshing state: local refetches resolve
  // in milliseconds, so without this the "Refreshing..." label flashes by
  // too fast to read.
  const [refreshMinDelay, setRefreshMinDelay] = useState(false)
  const refreshing =
    overview.isFetching ||
    retention.isFetching ||
    modes.isFetching ||
    activity.isFetching ||
    refreshMinDelay
  function refreshAll() {
    setRefreshMinDelay(true)
    const minDelay = new Promise((resolve) => window.setTimeout(resolve, 1200))
    void Promise.all([
      overview.refetch(),
      retention.refetch(),
      modes.refetch(),
      activity.refetch(),
      minDelay,
    ]).then(() => {
      setManualRefreshAt(Date.now())
      setNowTick(Date.now())
      setRefreshMinDelay(false)
    })
  }

  const cards: { label: string; value: string; caption: string; icon: LucideIcon }[] = [
    {
      label: 'Total clusters',
      value: overview.data ? compact.format(overview.data.total_clusters) : 'n/a',
      caption: 'All clusters ever formed',
      icon: Users,
    },
    {
      label: 'Active clusters',
      value: overview.data ? compact.format(overview.data.active_clusters) : 'n/a',
      caption: 'Open rooms right now',
      icon: Activity,
    },
    {
      label: 'Active today',
      value: overview.data ? compact.format(overview.data.daily_active_clusters) : 'n/a',
      caption: 'Message or call in 24h',
      icon: Clock,
    },
    {
      label: 'Messages · 30d',
      value: overview.data ? compact.format(overview.data.messages_30d) : 'n/a',
      caption: 'Across all clusters',
      icon: MessagesSquare,
    },
    {
      label: 'Avg clusters per user',
      value: overview.data ? overview.data.avg_clusters_per_user.toFixed(1) : 'n/a',
      caption: 'Engagement vs spread',
      icon: Inbox,
    },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="font-display text-3xl font-semibold text-on-surface">Metrics</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Cluster health, retention, and mode popularity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-pill bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-all duration-300 ${refreshing ? 'animate-pulse' : ''}`}
          >
            {shortDate(rangeStart)} - {shortDate(rangeEnd)}
            {freshness ? ` · ${freshness}` : null}
          </span>
          <button
            type="button"
            onClick={refreshAll}
            disabled={refreshing}
            aria-busy={refreshing}
            className="inline-flex items-center gap-1.5 rounded-pill bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-all duration-200 hover:bg-primary-container active:scale-95 disabled:cursor-wait disabled:opacity-70"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 transition-transform duration-300 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden
            />
            {refreshing ? 'Refreshing...' : 'Refresh data'}
          </button>
        </div>
      </header>

      <section aria-label="Overview" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {overview.isLoading ? (
          <SectionLoading />
        ) : overview.isError || !overview.data ? (
          <SectionError message="Couldn’t load overview." onRetry={() => void overview.refetch()} />
        ) : (
          cards.map((card) => (
            <div
              key={card.label}
              data-e2e="metrics-overview-card"
              className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft"
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
              <p className="mt-2 text-3xl font-semibold tabular-nums text-on-surface">{card.value}</p>
            </div>
          ))
        )}
      </section>

      <SectionCard
        icon={History}
        title="Retention by formation cohort"
        caption="Share of each cohort still alive today"
        label="Retention"
      >
        {retention.isLoading ? (
          <SectionLoading />
        ) : retention.isError ? (
          <SectionError message="Couldn’t load retention." onRetry={() => void retention.refetch()} />
        ) : retentionRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-outline-variant bg-surface-container/40 p-6 text-center text-sm text-on-surface-variant">
            No cohorts old enough yet. The 7-day cohort appears a week after the first cluster forms.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/60 text-xs text-on-surface-variant">
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    <span className="inline-flex items-center gap-1">
                      Cohort
                      <InfoTip label="What is a cohort?" text="Clusters grouped by formation age. The 7-day row covers clusters formed at least 7 days ago, and so on." />
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium tabular-nums">Formed</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      Retained
                      <InfoTip label="What counts as retained?" text="Still active with at least 6 members and at least one message in the last 30 days." align="right" />
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      Rate
                      <InfoTip label="What is the retention rate?" text="Retained share of the cohort. The 90-day rate is the primary success metric." align="right" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {retentionRows.map((row) => (
                  <tr key={row.cohort_days} data-e2e="metrics-retention-row" className="border-b border-outline-variant/40 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-on-surface">{row.cohort_days}-day</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-on-surface-variant">
                      {compact.format(row.formed)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-on-surface-variant">
                      {compact.format(row.retained)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center justify-end gap-2">
                        <span
                          aria-hidden
                          className="h-2 w-24 overflow-hidden rounded-full bg-surface-container"
                        >
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.round(Number(row.rate) * 100)}%` }}
                          />
                        </span>
                        <span className="font-semibold tabular-nums text-on-surface">
                          {Math.round(Number(row.rate) * 100)}%
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs leading-5 text-on-surface-variant">
          Retained means still active with at least 6 members and a message in the last 30
          days. The 90-day cohort is the primary success metric; 7-day and 30-day cohorts
          are interim proxies until 90 days of history exist.
        </p>
      </SectionCard>

      <SectionCard
        icon={Layers}
        title="Mode popularity"
        caption="Last 30 days · bars show join share"
        label="Mode breakdown"
      >
        {modes.isLoading ? (
          <SectionLoading />
        ) : modes.isError ? (
          <SectionError message="Couldn’t load mode breakdown." onRetry={() => void modes.refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/60 text-xs text-on-surface-variant">
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Mode</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      Formed
                      <InfoTip label="What does formed mean?" text="Clusters formed in this mode over the last 30 days." />
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      Joins
                      <InfoTip label="What does joins count?" text="Queue join events, not unique users. Leaving and rejoining counts again. Counted since deploy." />
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      Avg queue depth
                      <InfoTip label="What is average queue depth?" text="Mean number of people waiting in this mode's queues each day. Low depth with high waits means a thin pool." />
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      Longest wait
                      <InfoTip label="What is longest wait?" text="Longest time any current waiter has spent queued, over the last 30 days. Growing waits mean the mode is stalling." align="right" />
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      Active
                      <InfoTip label="What does active mean?" text="Clusters currently open in this mode." align="right" />
                    </span>
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      Msgs / cluster
                      <InfoTip label="What is messages per cluster?" text="Mean messages per active cluster in this mode over the last 30 days." align="right" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {modeRows.map((row) => {
                  const { label, Icon } = modeDisplay(row.mode)
                  return (
                    <tr key={row.mode} data-e2e="metrics-mode-row" className="border-b border-outline-variant/40 last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5 font-medium text-on-surface">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden />
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-on-surface-variant">
                        {compact.format(row.clusters_formed)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center justify-end gap-2">
                          <span
                            aria-hidden
                            className="h-2 w-16 overflow-hidden rounded-full bg-surface-container"
                          >
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${Math.round((row.queue_joins / maxJoins) * 100)}%` }}
                            />
                          </span>
                          <span className="tabular-nums text-on-surface-variant">
                            {compact.format(row.queue_joins)}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-on-surface-variant">
                        {Number(row.avg_queue_depth).toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-on-surface-variant">
                        {formatWait(Number(row.max_oldest_wait_hours))}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-on-surface-variant">
                        {compact.format(row.active_clusters)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-on-surface-variant">
                        {compact.format(Math.round(Number(row.avg_messages_per_cluster)))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs leading-5 text-on-surface-variant">
          Joins are join events, not unique users: leaving and rejoining counts again.
          Join counts start at deploy; depth and wait history ramp from the first rollup.
        </p>
      </SectionCard>

      <SectionCard
        icon={TrendingUp}
        title="Cluster activity"
        caption="Most active clusters first · dot shows recency"
        label="Cluster activity"
      >
        {activity.isLoading ? (
          <SectionLoading />
        ) : activity.isError ? (
          <SectionError message="Couldn’t load cluster activity." onRetry={() => void activity.refetch()} />
        ) : activityRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-outline-variant bg-surface-container/40 p-6 text-center text-sm text-on-surface-variant">
            No active clusters yet.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-outline-variant/60 text-xs text-on-surface-variant">
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Cluster</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Mode</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium tabular-nums">Members</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium tabular-nums">Msgs · 30d</th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Last message</th>
                  </tr>
                </thead>
                <tbody>
                  {activityRows.map((row) => {
                    const age = daysSince(row.last_message_day)
                    const health =
                      age === null
                        ? { dot: 'bg-outline-variant', label: 'No messages yet' }
                        : age <= 7
                          ? { dot: 'bg-emerald-700', label: 'Active this week' }
                          : age <= 30
                            ? { dot: 'bg-amber-700', label: 'Quiet for over a week' }
                            : { dot: 'bg-outline-variant', label: 'Silent for over a month' }
                    return (
                      <tr key={row.cluster_id} data-e2e="metrics-activity-row" className="border-b border-outline-variant/40 last:border-0">
                        <td className="max-w-44 truncate px-4 py-2.5 font-medium text-on-surface">{row.name}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-on-surface-variant">
                          {modeDisplay(row.mode).label}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-on-surface-variant">
                          {row.active_members} / 8
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-on-surface-variant">
                          {compact.format(row.messages_30d)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-on-surface-variant">
                          <span className="flex items-center gap-1.5">
                            <span title={health.label} className={`h-2 w-2 shrink-0 rounded-full ${health.dot}`} />
                            {formatDay(row.last_message_day)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-on-surface-variant">
                Showing top {activityRows.length} active cluster{activityRows.length === 1 ? '' : 's'}
              </p>
              {activityRows.length >= activityLimit && activityLimit < MAX_ACTIVITY_LIMIT && (
                <button
                  type="button"
                  onClick={showMoreActivity}
                  className="rounded-pill border border-outline-variant/70 px-4 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
                >
                  Show more
                </button>
              )}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}

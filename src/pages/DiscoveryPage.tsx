import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { CLUSTER_SIZE } from '../lib/constants'
import { MATCHING_MODES } from '../lib/modes'
import { usePublicClusterCounts } from '../features/discovery'
import { useMyQueueStatus, useMyClusters } from '../features/matching'
import { ClusterCard } from '../components/ClusterCard'

export function DiscoveryPage() {
  useDocumentTitle('Discovery')
  const counts = usePublicClusterCounts()
  const status = useMyQueueStatus()
  const countByMode = new Map((counts.data ?? []).map((r) => [r.mode, r.cluster_count]))

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <h1 className="font-display text-3xl font-semibold text-on-surface">Discovery</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Browse every matching mode and see what’s out there. Pick a mode to check queues and
          active clusters.
        </p>
      </header>

      <section aria-label="Matching modes" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MATCHING_MODES.map((mode) => (
          <ModeTile
            key={mode.value}
            value={mode.value}
            label={mode.label}
            detail={mode.detail}
            count={counts.isLoading ? undefined : (countByMode.get(mode.value) ?? 0)}
            status={status.data?.find((r) => r.mode === mode.value)}
          />
        ))}
      </section>

      <MyClustersSection />
    </div>
  )
}

function ModeTile({
  value,
  label,
  detail,
  count,
  status,
}: {
  value: string
  label: string
  detail: string
  count: number | undefined
  status: { cluster_id: string | null; joined: boolean; waiting: number } | undefined
}) {
  const stateLine = status
    ? status.cluster_id
      ? 'You’re in a cluster'
      : status.joined
        ? `${status.waiting} of ${CLUSTER_SIZE} waiting`
        : 'No queue yet'
    : 'No queue yet'

  return (
    <Link
      to={`/discovery/${value}`}
      className="group block min-w-0 rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{label}</p>
        <span className="shrink-0 rounded-pill bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
          {count === undefined ? '…' : `${count} ${count === 1 ? 'cluster' : 'clusters'}`}
        </span>
      </div>
      <p className="mt-2 text-sm text-on-surface-variant">{detail}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-on-surface-variant">{stateLine}</span>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-on-surface-variant transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
    </Link>
  )
}

function MyClustersSection() {
  const clusters = useMyClusters()
  if (clusters.data && clusters.data.length === 0) return null
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold text-on-surface">Your clusters</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {(clusters.data ?? []).map((item) => (
          <ClusterCard key={item.cluster.id} item={item} />
        ))}
      </div>
    </section>
  )
}
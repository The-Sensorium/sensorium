import { Link } from 'react-router'
import { ArrowRight, Loader2, Plus, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { CLUSTER_SIZE } from '../lib/constants'
import { MATCHING_MODES } from '../lib/modes'
import { usePublicClusterCounts } from '../features/discovery'
import { useMyQueueStatus, useMyClusters, type MyCluster } from '../features/matching'
import { isPendingCreated } from '../features/created-clusters'
import { useUnreadChatCounts } from '../features/notifications'
import { MemberClusterCard } from '../components/ClusterCard'

export function ClustersPage() {
  useDocumentTitle('Clusters')
  const clusters = useMyClusters()
  const counts = usePublicClusterCounts()
  const status = useMyQueueStatus()
  const unread = useUnreadChatCounts((clusters.data ?? []).length > 0)
  const unreadByCluster = unread.data ?? new Map<string, number>()
  const countByMode = new Map((counts.data ?? []).map((r) => [r.mode, r.cluster_count]))

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <h1 className="font-display text-3xl font-semibold text-on-surface">Clusters</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Every cluster you’ve been matched into or created. Browse a matching mode below to meet more people.
        </p>
        <Link
          to="/clusters/new"
          data-e2e="create-cluster-button"
          className="mt-4 inline-flex min-h-[48px] items-center gap-1.5 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary shadow-soft transition-colors hover:bg-primary-container"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Create a cluster
        </Link>
        <p className="mt-2 text-xs text-on-surface-variant">
          Bring people you’ve met in Sensorium together in a new space.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-on-surface">Your clusters</h2>
        {clusters.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : (clusters.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
            <Users className="mx-auto h-6 w-6 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 text-sm text-on-surface-variant">
              No clusters yet. Join a matching mode below and you’ll be matched with{' '}
              {CLUSTER_SIZE - 1} strangers, or create a cluster with people you’ve already met.
            </p>
          </div>
        ) : (
          <ClusterList
            items={clusters.data ?? []}
            unreadByCluster={unreadByCluster}
          />
        )}
      </section>

      <section aria-label="Matching modes" className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-on-surface">Find a match</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MATCHING_MODES.map((mode) => (
            <ModeTile
              key={mode.value}
              value={mode.value}
              label={mode.label}
              detail={mode.detail}
              icon={mode.icon}
              count={counts.isLoading ? undefined : (countByMode.get(mode.value) ?? 0)}
              status={status.data?.find((r) => r.mode === mode.value)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function ClusterList({
  items,
  unreadByCluster,
}: {
  items: MyCluster[]
  unreadByCluster: Map<string, number>
}) {
  const pending = items.filter((i) => isPendingCreated(i.cluster, i.memberCount))
  const active = items.filter((i) => !isPendingCreated(i.cluster, i.memberCount))

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-3" aria-label="Pending clusters">
          {pending.map((item) => (
            <MemberClusterCard
              key={item.cluster.id}
              item={item}
              unreadCount={unreadByCluster.get(item.cluster.id) ?? 0}
            />
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {active.map((item) => (
          <MemberClusterCard
            key={item.cluster.id}
            item={item}
            unreadCount={unreadByCluster.get(item.cluster.id) ?? 0}
          />
        ))}
      </div>
    </div>
  )
}

function ModeTile({
  value,
  label,
  detail,
  icon: Icon,
  count,
  status,
}: {
  value: string
  label: string
  detail: string
  icon: LucideIcon
  count: number | undefined
  status: { cluster_id: string | null; joined: boolean; waiting: number } | undefined
}) {
  const stateLine = status
    ? status.cluster_id
      ? "You're in a cluster"
      : status.joined
        ? `${status.waiting} of ${CLUSTER_SIZE} waiting`
        : 'No queue yet'
    : 'No queue yet'

  return (
    <Link
      to={`/discovery/${value}`}
      className="group block min-w-0 rounded-2xl border border-outline-variant bg-surface-container p-5 shadow-soft transition-colors hover:border-outline hover:bg-surface-high hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{label}</p>
        </div>
        <span className="shrink-0 rounded-pill bg-surface-lowest px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
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

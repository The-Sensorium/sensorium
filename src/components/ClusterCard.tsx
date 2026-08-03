import { Link } from 'react-router'
import { Users } from 'lucide-react'
import type { Database } from '../lib/database.types'
import type { MyCluster } from '../features/matching'
import { modeInfo } from '../lib/modes'

type ClusterStatus = Database['public']['Enums']['cluster_status']

function statusLabel(status: ClusterStatus, introComplete: boolean): string {
  if (status === 'archived') return 'Archived'
  if (status === 'active') return 'Active'
  if (introComplete) return 'Introductions complete'
  return 'Introductions in progress'
}

export function ClusterCard({ item }: { item: MyCluster }) {
  const { cluster } = item
  const introComplete = cluster.introductions_completed_at !== null
  const target =
    cluster.status === 'introductions' && !introComplete
      ? `/cluster/${cluster.id}/introductions`
      : `/cluster/${cluster.id}`

  return (
    <Link
      to={target}
      className="block min-w-0 rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {modeInfo(cluster.matching_mode).label}
          </p>
          <h3 className="mt-1 truncate font-display text-lg font-semibold text-on-surface">
            {cluster.name}
          </h3>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
          <Users className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          {item.memberCount} members
        </span>
      </div>
      <p className="mt-3 text-sm text-on-surface-variant">{statusLabel(cluster.status, introComplete)}</p>
    </Link>
  )
}

import { Link } from 'react-router'
import { MessagesSquare, Users } from 'lucide-react'
import type { Database } from '../lib/database.types'
import type { MyCluster } from '../features/matching'
import { useMyMembership } from '../features/introductions'
import { modeInfo } from '../lib/modes'
import { UnreadBadge } from './UnreadBadge'

type ClusterStatus = Database['public']['Enums']['cluster_status']

function statusLabel(status: ClusterStatus): string {
  if (status === 'archived') return 'Archived'
  return 'Active'
}

export function ClusterCard({
  item,
  myIntroCompletedAt,
  unreadCount,
}: {
  item: MyCluster
  myIntroCompletedAt?: string | null
  unreadCount?: number
}) {
  const { cluster } = item
  const info = modeInfo(cluster.matching_mode)
  const target = `/cluster/${cluster.id}`
  const needsIntros = myIntroCompletedAt === null
  const count = unreadCount ?? 0

  return (
    <Link
      to={target}
      className="block min-w-0 rounded-2xl border border-outline-variant bg-surface-container p-5 shadow-soft transition-colors hover:border-outline hover:bg-surface-high hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <info.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="truncate">{info.label}</span>
          </p>
          <h3 className="mt-1 truncate font-display text-lg font-semibold text-on-surface">
            {cluster.name}
          </h3>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-surface-lowest px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
          <Users className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          {item.memberCount} members
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-on-surface-variant">
          {needsIntros ? (
            <>Complete your introductions</>
          ) : (
            statusLabel(cluster.status)
          )}
        </p>
        {count > 0 && (
          <span
            data-e2e={`cluster-unread-badge-${cluster.id}`}
            className="relative inline-flex shrink-0 items-center rounded-pill bg-surface-lowest px-3 py-1.5 text-xs font-semibold text-on-surface-variant"
          >
            <MessagesSquare className="h-4 w-4 text-primary" strokeWidth={1.5} aria-hidden />
            <UnreadBadge count={count} label={`${count} unread messages`} />
          </span>
        )}
      </div>
    </Link>
  )
}

/** ClusterCard with the caller's intro state: personalizes the pending copy. */
export function MemberClusterCard({ item, unreadCount }: { item: MyCluster; unreadCount?: number }) {
  const membership = useMyMembership(item.cluster.id)
  return (
    <ClusterCard
      item={item}
      myIntroCompletedAt={membership.data ? membership.data.intro_completed_at : undefined}
      unreadCount={unreadCount}
    />
  )
}

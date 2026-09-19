import { Link } from 'react-router'
import { Users } from 'lucide-react'
import type { Database } from '../lib/database.types'
import type { MyCluster } from '../features/matching'
import { useMyMembership } from '../features/introductions'
import { modeInfo } from '../lib/modes'
import { CountdownTimer } from './CountdownTimer'

type ClusterStatus = Database['public']['Enums']['cluster_status']

function statusLabel(status: ClusterStatus, introComplete: boolean): string {
  if (status === 'archived') return 'Archived'
  if (status === 'active') return 'Active'
  if (introComplete) return 'Introductions complete'
  return 'Introductions in progress'
}

export function ClusterCard({
  item,
  myIntroCompletedAt,
}: {
  item: MyCluster
  myIntroCompletedAt?: string | null
}) {
  const { cluster } = item
  const introComplete = cluster.introductions_completed_at !== null
  const info = modeInfo(cluster.matching_mode)
  const pending = cluster.status === 'introductions' && !introComplete
  const needsIntros = pending && myIntroCompletedAt === null
  const waitingOnOthers = pending && typeof myIntroCompletedAt === 'string'
  const target = waitingOnOthers
    ? `/cluster/${cluster.id}/waiting`
    : pending
      ? `/cluster/${cluster.id}/introductions`
      : `/cluster/${cluster.id}`

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
      <p className="mt-3 text-sm text-on-surface-variant">
        {needsIntros ? (
          <>
            Complete your introductions
            {cluster.introductions_deadline ? (
              <>
                {' · '}Deadline:{' '}
                <CountdownTimer deadline={cluster.introductions_deadline} className="font-semibold" />
              </>
            ) : null}
          </>
        ) : waitingOnOthers ? (
          <>
            Waiting for the others
            {cluster.introductions_deadline ? (
              <>
                {' · '}Deadline:{' '}
                <CountdownTimer deadline={cluster.introductions_deadline} className="font-semibold" />
              </>
            ) : null}
          </>
        ) : (
          statusLabel(cluster.status, introComplete)
        )}
      </p>
    </Link>
  )
}

/** ClusterCard with the caller's intro state: personalizes the pending copy. */
export function MemberClusterCard({ item }: { item: MyCluster }) {
  const membership = useMyMembership(item.cluster.id)
  return (
    <ClusterCard
      item={item}
      myIntroCompletedAt={membership.data ? membership.data.intro_completed_at : undefined}
    />
  )
}

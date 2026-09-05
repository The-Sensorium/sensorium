import { Link } from 'react-router'
import { Archive, CalendarDays, CircleCheck, Hourglass, Users } from 'lucide-react'
import type { ClusterTile } from '../features/discovery'
import { modeInfo } from '../lib/modes'

const tileBase =
  'block min-w-0 rounded-2xl border border-outline-variant bg-surface-container p-5 shadow-soft'
const tileInteractive =
  `${tileBase} transition-colors hover:border-outline hover:bg-surface-high hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`

const formedFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const statusMeta: Record<ClusterTile['status'], { icon: typeof CircleCheck; label: string; className: string }> = {
  active: { icon: CircleCheck, label: 'Active', className: 'text-emerald-700' },
  introductions: {
    icon: Hourglass,
    label: 'Introductions in progress',
    className: 'text-amber-700',
  },
  archived: { icon: Archive, label: 'Archived', className: 'text-on-surface-variant' },
}

export function PublicClusterCard({ cluster, isMember }: { cluster: ClusterTile; isMember: boolean }) {
  const status = statusMeta[cluster.status]
  const info = modeInfo(cluster.matching_mode)

  const body = (
    <>
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
          {cluster.member_count} members
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-1 text-sm text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <status.icon className={`h-4 w-4 ${status.className}`} strokeWidth={1.75} aria-hidden />
          <span className={status.className}>{status.label}</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs">
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          Formed {formedFormatter.format(new Date(cluster.created_at))}
        </span>
      </div>
    </>
  )

  if (isMember) {
    return (
      <Link to={`/cluster/${cluster.id}`} className={tileInteractive}>
        {body}
      </Link>
    )
  }
  return <div className={tileBase}>{body}</div>
}
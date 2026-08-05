import { Link, Navigate, NavLink, Outlet, useLocation, useParams } from 'react-router'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../auth-context'
import { useCluster, useMyMembership } from '../../features/introductions'
import { useClusterMembers } from '../../features/matching'
import { useClusterChannel, usePresence } from '../../features/realtime'
import { Avatar } from '../../components/Avatar'
import { ClusterRail } from '../../components/ClusterRail'

const SECTIONS = [
  { to: '', label: 'Room', end: true },
  { to: 'members', label: 'Members', end: false },
  { to: 'signals', label: 'Signals', end: false },
  { to: 'votes', label: 'Votes', end: false },
  { to: 'settings', label: 'Settings', end: false },
]

export function ClusterLayout() {
  const { clusterId = '' } = useParams()
  const { pathname } = useLocation()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const isRoom = pathname === `/cluster/${clusterId}`
  const isSettings = pathname === `/cluster/${clusterId}/settings`

  const cluster = useCluster(clusterId)
  const membership = useMyMembership(clusterId)
  const members = useClusterMembers(clusterId, clusterId !== '')
  const { online } = usePresence(clusterId)

  // One Postgres-Changes subscription for the whole cluster shell keeps the room,
  // signals and votes surfaces live while they are mounted (RLS scopes the events).
  useClusterChannel(clusterId)

  if (cluster.isLoading || membership.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    )
  }

  if (!cluster.data || !membership.data) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center text-sm text-on-surface-variant">
        This cluster isn’t available to you.
      </div>
    )
  }

  // Intro phase still running → waiting screen (the room is locked).
  if (!cluster.data.introductions_completed_at) {
    return <Navigate to={`/cluster/${clusterId}/waiting`} replace />
  }

  const memberCount = (members.data ?? []).length
  const onlineCount = (members.data ?? []).filter((m) => online.has(m.id) || m.id === userId).length

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-6xl',
        isRoom
          ? 'flex flex-col gap-4 lg:h-[calc(100dvh_-_7.5rem)]'
          : 'space-y-4',
      )}
    >
      {/* Doorframe - slim, quiet. The cluster name + a whisper of the room. */}
      <header
        className={cn(
          'z-30 -mx-6 border-b border-outline-variant/60 bg-background/95 px-6 backdrop-blur',
          isRoom ? 'shrink-0 lg:static' : 'sticky top-16',
        )}
      >
        <div className="flex items-center gap-2 py-3">
          <Link
            to="/home"
            aria-label="Back to home"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-primary">
              {cluster.data.mode_label}
            </p>
            <h1 className="truncate font-display text-lg font-semibold text-on-surface">
              {cluster.data.name}
            </h1>
          </div>
        </div>
        <nav aria-label="Room sections" className="flex gap-1 overflow-x-auto pb-2">
          {SECTIONS.map((section) => (
            <NavLink
              key={section.to}
              to={`/cluster/${clusterId}${section.to ? `/${section.to}` : ''}`}
              end={section.end}
              className={({ isActive }) =>
                cn(
                  'shrink-0 whitespace-nowrap border-b-2 px-2 py-1 text-sm transition-colors',
                  isActive
                    ? 'border-primary font-semibold text-on-surface'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface',
                )
              }
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Presence strip - a quiet row of faces. Only on the Room tab. */}
      {isRoom && (
        <section
          aria-label="Who is in the room"
          className="shrink-0 rounded-2xl border border-outline-variant/60 bg-surface px-4 py-3 shadow-soft"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-on-surface">
                In the room now
              </h2>
              <span className="text-xs text-on-surface-variant">
                {onlineCount} of {memberCount} here
              </span>
            </div>
            <ul className="flex flex-wrap items-center gap-2">
              {(members.data ?? []).map((m) => {
                const isMe = m.id === userId
                return (
                  <li key={m.id}>
                    <Link
                      to={`/profile/${m.id}?cluster=${clusterId}`}
                      title={`${m.display_name}${isMe ? ' (you)' : ''}`}
                      className="relative block"
                    >
                      <Avatar
                        name={m.display_name}
                        src={m.avatar_url}
                        className={cn('h-7 w-7', isMe && 'ring-2 ring-primary')}
                        textClassName="text-xs"
                      />
                      {online.has(m.id) || isMe ? (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-emerald-500"
                          aria-hidden
                        />
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      {/* The room: conversation + side table on desktop. */}
      <div
        className={cn(
          'lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6',
          isRoom ? 'lg:min-h-0 lg:flex-1' : 'lg:items-start',
        )}
      >
        <div className={cn('room-view-in min-w-0', isRoom && 'lg:h-full lg:min-h-0')}>
          <Outlet />
        </div>
        {!isSettings && (
          <aside
            className={cn(
              'hidden min-w-0 lg:block',
              isRoom && 'lg:h-full lg:min-h-0 lg:overflow-y-auto',
            )}
          >
            <ClusterRail
              clusterId={clusterId}
              stickyTop={isRoom ? 'top-0' : 'top-40'}
            />
          </aside>
        )}
      </div>
    </div>
  )
}

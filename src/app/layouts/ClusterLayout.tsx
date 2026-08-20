import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Loader2, Menu, MessageCircle, MessageSquare, Scale, Settings, Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import { modeInfo } from '../../lib/modes'
import { useCluster, useMyMembership } from '../../features/introductions'
import { useClusterChannel } from '../../features/realtime'
import { ClusterRail } from '../../components/ClusterRail'

const SECTIONS = [
  { to: '', label: 'Room', icon: MessageSquare, end: true },
  { to: 'members', label: 'Members', icon: Users, end: false },
  { to: 'signals', label: 'Signals', icon: MessageCircle, end: false },
  { to: 'votes', label: 'Votes', icon: Scale, end: false },
  { to: 'settings', label: 'Settings', icon: Settings, end: false },
]

export function ClusterLayout() {
  const { clusterId = '' } = useParams()
  const { pathname, key } = useLocation()
  const navigate = useNavigate()
  const isRoom = pathname === `/cluster/${clusterId}`
  const isSettings = pathname === `/cluster/${clusterId}/settings`

  const cluster = useCluster(clusterId)
  const membership = useMyMembership(clusterId)
  const [sectionsOpen, setSectionsOpen] = useState(false)

  // One Postgres-Changes subscription for the whole cluster shell keeps the room,
  // signals and votes surfaces live while they are mounted (RLS scopes the events).
  useClusterChannel(clusterId)

  // Close the mobile sections menu on outside click / Escape.
  useEffect(() => {
    function dismiss() {
      setSectionsOpen(false)
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('click', dismiss)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', dismiss)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

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

  // Intro phase still running → waiting screen (the room is locked); it bounces
  // this member to the form if their own intro is still pending.
  if (!cluster.data.introductions_completed_at) {
    return <Navigate to={`/cluster/${clusterId}/waiting`} replace />
  }

  // Cluster already unlocked but this member joined later (via replacement)
  // without completing their intro: make them finish before entering the room.
  if (!membership.data.intro_completed_at) {
    return <Navigate to={`/cluster/${clusterId}/introductions`} replace />
  }

  const ModeIcon = modeInfo(cluster.data.matching_mode).icon

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-6xl',
        isRoom
          ? 'flex h-[calc(100dvh_-_5.5rem_-_var(--bottom-nav-offset))] flex-col gap-4 lg:h-[calc(100dvh_-_7.5rem)]'
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
          <button
            type="button"
            aria-label="Go back"
            onClick={() => (key === 'default' ? navigate('/clusters', { replace: true }) : navigate(-1))}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <p className="hidden items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary sm:flex">
              <ModeIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="truncate">{cluster.data.mode_label}</span>
            </p>
            <h1 className="truncate font-display text-lg font-semibold text-on-surface">
              {cluster.data.name}
            </h1>
          </div>
          {/* Mobile-only sections menu: the chat keeps the whole band to itself
              and the other sections live behind this menu. Desktop keeps the
              tab row below. */}
          <div className="relative shrink-0 lg:hidden">
            <button
              type="button"
              aria-label="Cluster sections"
              aria-haspopup="menu"
              aria-expanded={sectionsOpen}
              aria-controls={sectionsOpen ? 'cluster-sections-menu' : undefined}
              onClick={(e) => {
                e.stopPropagation()
                setSectionsOpen((open) => !open)
              }}
              className="grid h-8 w-8 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <Menu className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </button>
            {sectionsOpen && (
              <div
                id="cluster-sections-menu"
                role="menu"
                aria-label="Cluster sections"
                className="absolute right-0 top-full z-40 mt-2 flex w-48 flex-col gap-1 rounded-2xl border border-outline-variant/60 bg-surface p-1 shadow-lift"
                onClick={(e) => e.stopPropagation()}
              >
                {SECTIONS.map((section) => (
                  <NavLink
                    key={section.to}
                    to={`/cluster/${clusterId}${section.to ? `/${section.to}` : ''}`}
                    end={section.end}
                    role="menuitem"
                    onClick={() => setSectionsOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
                  >
                    <section.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    {section.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </div>
        <nav aria-label="Room sections" className="hidden gap-1 pb-2 lg:flex lg:overflow-x-auto">
          {SECTIONS.map((section) => (
            <NavLink
              key={section.to}
              to={`/cluster/${clusterId}${section.to ? `/${section.to}` : ''}`}
              end={section.end}
              className={({ isActive }) =>
                cn(
                  'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors',
                  'lg:flex-initial lg:flex-row lg:gap-1.5 lg:whitespace-nowrap lg:border-b-2 lg:px-2 lg:py-1 lg:text-sm',
                  isActive
                    ? 'text-primary lg:border-primary lg:font-semibold lg:text-on-surface'
                    : 'text-on-surface-variant lg:border-transparent lg:hover:text-on-surface',
                )
              }
            >
              <section.icon className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" strokeWidth={1.5} aria-hidden />
              {section.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* The room: conversation + side table on desktop. */}
      <div
        className={cn(
          'flex min-h-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6',
          isRoom ? 'flex-1 lg:min-h-0' : 'lg:items-start',
        )}
      >
        <div
          className={cn(
            'room-view-in min-w-0',
            isRoom && 'flex min-h-0 flex-1 flex-col lg:h-full',
          )}
        >
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

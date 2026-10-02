import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Megaphone, Menu, MessageSquare, Scale, Settings, Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import { modeInfo } from '../../lib/modes'
import { useAuth } from '../auth-context'
import { useCluster, useMyMembership } from '../../features/introductions'
import { useClusterMembers } from '../../features/matching'
import { useClusterChannel, isOnlineNow, usePresence } from '../../features/realtime'
import { ClusterRail } from '../../components/ClusterRail'
import { RoutePending } from '../../components/RoutePending'

const SECTIONS = [
  { to: '', label: 'Room', icon: MessageSquare, end: true },
  { to: 'members', label: 'Members', icon: Users, end: false },
  { to: 'signals', label: 'Signals', icon: Megaphone, end: false },
  { to: 'votes', label: 'Votes', icon: Scale, end: false },
  { to: 'settings', label: 'Settings', icon: Settings, end: false },
]

export function ClusterLayout() {
  const { clusterId = '' } = useParams()
  const { pathname, key } = useLocation()
  const navigate = useNavigate()
  // Trailing slash must not change the route identity: AppShell's immersive
  // regex already accepts an optional slash, so normalize here too. Otherwise
  // `/cluster/abc/` would hide the global chrome but render the non-room
  // header (half-immersive page).
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const isRoom = normalizedPath === `/cluster/${clusterId}`
  const isSettings = normalizedPath === `/cluster/${clusterId}/settings`

  const cluster = useCluster(clusterId)
  const membership = useMyMembership(clusterId)
  const members = useClusterMembers(clusterId)
  const auth = useAuth()
  const selfId = auth.state === 'signedIn' ? auth.userId : null
  // Presence count for the compact mobile room header (mirrors the native
  // app's "X of Y here" subtitle). Shared channel, no extra subscription.
  const { online } = usePresence(isRoom ? clusterId : null)
  const memberCount = (members.data ?? []).length
  const onlineCount = (members.data ?? []).filter((m) => isOnlineNow(online, m.id, selfId)).length
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

  // Header and tabs render from cache with skeletons; the Outlet below
  // never waits for cluster or membership so tab switches stay instant.
  // Child pages fetch their own data by clusterId.
  const pending = cluster.isPending || membership.isPending
  const unavailable =
    !pending && (!cluster.data || !membership.data)

  if (unavailable) {
    // Immersive surfaces hide the global chrome on mobile, so this state
    // needs its own way out (stale deep link, revoked access). No global
    // nav is rendered above us here.
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        <button
          type="button"
          aria-label="Back to Home"
          onClick={() => navigate('/home')}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 py-2 text-[15px] font-semibold text-primary transition-colors hover:bg-surface-container"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Home
        </button>
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center text-sm text-on-surface-variant">
          This cluster isn’t available to you.
        </div>
      </div>
    )
  }

  // Clusters open at formation: every active member enters the room directly.
  // Introductions are an optional in-cluster checklist and never gate access.
  // Exception: user-created clusters stay members-tab-only until 3 confirmed
  // members activate them (see docs/CREATED_CLUSTER_PLAN.md). Settings stays
  // open throughout: it holds only details plus leave, and leaving must stay
  // possible while pending. Unknown membership locks: a direct nav must not
  // flash the room before the roster resolves. A roster error fails open to
  // the tabs (each shows its own error; RLS/RPCs still enforce access).
  const isCreated = cluster.data?.origin === 'created'
  const confirmedCount = members.data?.length ?? 0
  const membersUnknown = members.isPending
  const createdPending =
    isCreated === true && (membersUnknown || confirmedCount < 3) && !members.isError
  const onMembersTab = normalizedPath === `/cluster/${clusterId}/members`
  const onSettingsTab = normalizedPath === `/cluster/${clusterId}/settings`
  const locked = createdPending && !onMembersTab && !onSettingsTab

  const ModeIcon = cluster.data ? modeInfo(cluster.data.matching_mode).icon : null

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-6xl',
        isRoom
          ? 'flex h-[calc(100dvh-1rem)] flex-col gap-2 max-lg:[html.keyboard-open_&]:h-[calc(var(--vv-h,100dvh)-1rem)] lg:h-[calc(100dvh_-_7.5rem)] lg:gap-4'
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
        <div className={cn('flex items-center gap-2', isRoom ? 'py-2 lg:py-3' : 'py-3')}>
          <button
            type="button"
            aria-label={isRoom ? 'Back to Home' : 'Go back'}
            // The room promises "Home" (visible text on mobile, accessible
            // name everywhere): go to a deterministic parent like the native
            // room, which always exits home. Other sections keep history-back
            // with a clusters fallback for direct loads.
            onClick={() => {
              if (isRoom) {
                navigate('/home')
              } else if (key === 'default') {
                navigate('/clusters', { replace: true })
              } else {
                navigate(-1)
              }
            }}
            className={cn(
              'flex h-11 min-h-[44px] w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface',
              isRoom && 'max-lg:w-auto max-lg:gap-1.5 max-lg:px-2 max-lg:text-primary max-lg:hover:text-primary',
            )}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {isRoom && (
              <span className="text-[15px] font-semibold lg:hidden">Home</span>
            )}
          </button>
          <div className={cn('min-w-0 flex-1', isRoom && 'max-lg:text-center')}>
            <p
              className={cn(
                'hidden items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary',
                isRoom ? 'lg:flex' : 'sm:flex',
              )}
            >
              {cluster.data?.origin === 'created' ? (
                <span className="truncate">Created cluster</span>
              ) : ModeIcon && cluster.data ? (
                <>
                  <ModeIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  <span className="truncate">{cluster.data.mode_label}</span>
                </>
              ) : (
                <span className="h-3.5 w-24 animate-pulse rounded bg-surface-container" aria-hidden />
              )}
            </p>
            <h1 className="truncate font-display text-lg font-semibold text-on-surface">
              {cluster.data ? (
                cluster.data.name
              ) : (
                <span className="inline-block h-5 w-40 animate-pulse rounded bg-surface-container" aria-hidden />
              )}
            </h1>
            {isRoom && (
              <p className="truncate text-xs text-on-surface-variant lg:hidden">
                {onlineCount} of {memberCount} here
              </p>
            )}
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
              className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <Menu className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </button>
            {sectionsOpen && (
              <div
                id="cluster-sections-menu"
                role="menu"
                aria-label="Cluster sections"
                className="absolute right-0 top-full z-40 mt-2 flex w-48 flex-col gap-1 rounded-2xl border border-outline-variant/60 bg-surface p-2 shadow-lift"
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
                  'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5 text-xs font-medium transition-colors',
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
          <Suspense fallback={<RoutePending />}>
            {locked ? (
              <div className="mx-auto w-full max-w-xl space-y-4 rounded-2xl border border-outline-variant/60 bg-surface-container/40 p-8 text-center">
                <p className="font-display text-xl font-semibold text-on-surface">
                  Waiting for members
                </p>
                <p className="text-sm text-on-surface-variant">
                  {members.isPending ? (
                    <>This cluster activates once 3 members have joined. Chat, signals, votes, and calls unlock then.</>
                  ) : (
                    <>
                      This cluster activates once {3 - confirmedCount} more{' '}
                      {3 - confirmedCount === 1 ? 'member joins' : 'members join'}. Chat, signals,
                      votes, and calls unlock then.
                    </>
                  )}
                </p>
                <NavLink
                  to={`/cluster/${clusterId}/members`}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
                >
                  View members
                </NavLink>
              </div>
            ) : (
              <Outlet />
            )}
          </Suspense>
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

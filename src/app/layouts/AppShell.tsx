import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { Home, Newspaper, Settings, Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../auth-context'
import { BrandMark } from '../../components/BrandMark'
import { ProfileMenu } from '../../components/ProfileMenu'
import { ThemeToggle } from '../../components/theme-toggle'
import { NotificationBell } from '../../components/NotificationBell'
import { SwitchRoleButton } from '../../components/SwitchRoleButton'
import { RoutePending } from '../../components/RoutePending'
import { useNotificationsChannel } from '../../features/notifications'

const navItems = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/posts', label: 'Posts', icon: Newspaper },
  { to: '/notifications', label: 'Notifications', icon: undefined },
  { to: '/clusters', label: 'Clusters', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

function brandLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary-container/15 text-primary'
      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
  )
}

export function AppShell() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  useNotificationsChannel(userId)
  const { pathname } = useLocation()
  // Immersive mobile surfaces: the room (`/cluster/:id` index only, not
  // members/signals/votes/settings) and post detail (`/posts/:postId`) hide
  // the global chrome on small screens so content gets the full viewport.
  // Desktop keeps all chrome.
  const isMobileChat = /^\/cluster\/[^/]+\/?$/.test(pathname)
  const isMobilePostDetail = /^\/posts\/[^/]+\/?$/.test(pathname)
  const isImmersive = isMobileChat || isMobilePostDetail

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-pill focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-primary"
      >
        Skip to content
      </a>
      {/* Top nav - slim bar mobile (brand + theme), full nav desktop (md+).
          Hidden on small screens for immersive surfaces only. */}
      <header
        className={cn(
          'sticky top-0 z-40 border-b border-outline-variant/60 bg-surface/90 backdrop-blur',
          isImmersive && 'max-lg:hidden',
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <NavLink to="/home" className="flex items-center gap-2">
            <BrandMark size={40} />
            <span className="font-brand text-lg tracking-[0.15em] text-primary">Sensorium</span>
          </NavLink>
          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) =>
              item.to === '/notifications' ? (
                <NotificationBell key={item.to} variant="top" />
              ) : (
                <NavLink key={item.to} to={item.to} className={brandLinkClass}>
                  {item.icon && <item.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>
          <div className="flex items-center gap-2">
            <SwitchRoleButton />
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </div>
      </header>

      {/* Main content - immersive surfaces trim mobile padding to give the
          content the full viewport once the global chrome is hidden. */}
      <main
        id="main-content"
        className={cn(
          'mx-auto w-full max-w-6xl flex-1 overscroll-contain',
          isImmersive
            ? 'px-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:pb-8 lg:pt-6'
            : 'px-6 pb-24 pt-6 md:pb-8',
        )}
      >
        <Suspense fallback={<RoutePending />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Bottom nav - mobile only, hidden for immersive surfaces. Its height must match --bottom-nav-offset
       (reserved in index.css) so sticky/fixed page furniture sits flush on it. */}
      <nav
        data-bottom-nav
        className={cn(
          'fixed inset-x-0 bottom-0 z-20 h-[var(--bottom-nav-offset)] border-t border-outline-variant/60 bg-surface/95 backdrop-blur transition-[transform,visibility] duration-200 motion-reduce:transition-none lg:hidden',
          isImmersive && 'hidden',
        )}
      >
        <ul className="mx-auto flex h-full max-w-6xl items-center justify-around">
          {navItems.map((item) => (
            <li key={item.to} className="flex h-full flex-1 items-center justify-center">
              {item.to === '/notifications' ? (
                <NotificationBell variant="bottom" />
              ) : (
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 px-4 py-2 text-xs font-medium transition-colors',
                      isActive ? 'text-primary' : 'text-on-surface-variant',
                    )
                  }
                >
                  {item.icon && <item.icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />}
                  {item.label}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

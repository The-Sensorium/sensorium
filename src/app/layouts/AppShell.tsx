import { NavLink, Outlet } from 'react-router'
import { Home, Newspaper, Settings, Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../auth-context'
import { ThemeToggle } from '../../components/theme-toggle'
import { NotificationBell } from '../../components/NotificationBell'
import { SwitchRoleButton } from '../../components/SwitchRoleButton'
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-pill focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-primary"
      >
        Skip to content
      </a>
      {/* Top nav - slim bar mobile (brand + theme), full nav desktop (md+) */}
      <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <NavLink to="/home" className="font-brand text-lg tracking-[0.15em] text-primary">
            Sensorium
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
          </div>
        </div>
      </header>

      {/* Main content */}
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 pt-6 overscroll-contain md:pb-8">
        <Outlet />
      </main>

      {/* Bottom nav - mobile only. Its height must match --bottom-nav-offset
       (reserved in index.css) so sticky/fixed page furniture sits flush on it. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 h-[var(--bottom-nav-offset)] border-t border-outline-variant/60 bg-surface/95 backdrop-blur lg:hidden">
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
                      'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
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

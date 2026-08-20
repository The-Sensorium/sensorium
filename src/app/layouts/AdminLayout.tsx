import { Outlet } from 'react-router'
import { Flag, MessageSquareWarning, ScrollText, UserCog } from 'lucide-react'
import { useAuth } from '../auth-context'
import { ThemeToggle } from '../../components/theme-toggle'
import { SwitchRoleButton } from '../../components/SwitchRoleButton'
import { StaffMobileNav, StaffNavigation, type StaffNavItem } from '../../components/StaffNavigation'
import { useNotificationsChannel } from '../../features/notifications'

const navItems: readonly StaffNavItem[] = [
  { to: '/admin/reports', label: 'Reports', icon: Flag },
  { to: '/admin/appeals', label: 'Appeals', icon: MessageSquareWarning },
  { to: '/admin/roles', label: 'Roles', icon: UserCog },
  { to: '/admin/audit', label: 'Audit', icon: ScrollText },
] as const

export function AdminLayout() {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  useNotificationsChannel(userId)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-outline-variant/60 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
          <span className="font-brand text-lg tracking-[0.15em] text-primary">Sensorium</span>
          <StaffNavigation items={navItems} />
          <div className="flex items-center gap-2">
            <SwitchRoleButton />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 overscroll-contain sm:px-6 md:pb-8">
        <Outlet />
      </main>
      <StaffMobileNav items={navItems} />
    </div>
  )
}

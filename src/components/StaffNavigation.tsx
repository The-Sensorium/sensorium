import { NavLink } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'
import {
  useStaffUnreadCounts,
  type StaffNotificationType,
  type StaffUnreadCounts,
} from '../features/notifications'
import { UnreadBadge } from './UnreadBadge'

export type StaffNavItem = {
  to: string
  label: string
  icon: LucideIcon
  unreadKey?: StaffNotificationType
}

// Exhaustive: a new staff notification type must be mapped here or it fails at
// compile time rather than silently counting under the wrong tab.
const UNREAD_KEY_MAP: Record<StaffNotificationType, keyof StaffUnreadCounts> = {
  report_new: 'reports',
  appeal_new: 'appeals',
}

function unreadCountFor(
  unreadKey: StaffNotificationType | undefined,
  data: StaffUnreadCounts | undefined,
): number {
  return unreadKey ? data?.[UNREAD_KEY_MAP[unreadKey]] ?? 0 : 0
}

function linkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary-container/15 text-primary'
      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
  )
}

export function StaffNavigation({ items }: { items: readonly StaffNavItem[] }) {
  const unread = useStaffUnreadCounts()
  return (
    <nav className="hidden items-center gap-1 lg:flex" aria-label="Staff navigation">
      {items.map((item) => {
        const count = unreadCountFor(item.unreadKey, unread.data)
        return (
          <NavLink key={item.to} to={item.to} className={linkClass}>
            <span className="relative">
              <item.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              <UnreadBadge count={count} />
            </span>
            {item.label}
          </NavLink>
        )
      })}
    </nav>
  )
}

/** Mobile bottom tab bar for staff pages, matching the member app shell. Must be
 rendered as a sibling of the sticky header (a backdrop-filtered ancestor
 becomes the containing block for `fixed` children). Its height maps to
 --bottom-nav-offset so page furniture sits flush on it. */
export function StaffMobileNav({ items }: { items: readonly StaffNavItem[] }) {
  const unread = useStaffUnreadCounts()
  return (
    <nav
      aria-label="Staff navigation"
      className="fixed inset-x-0 bottom-0 z-20 h-[var(--bottom-nav-offset)] border-t border-outline-variant/60 bg-surface/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex h-full max-w-6xl items-stretch justify-around">
        {items.map((item) => {
          const count = unreadCountFor(item.unreadKey, unread.data)
          return (
            <li key={item.to} className="flex h-full flex-1 items-center justify-center">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-on-surface-variant',
                  )
                }
              >
                <span className="relative">
                  <item.icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                  <UnreadBadge count={count} />
                </span>
                {item.label}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
import { NavLink } from 'react-router'
import { Bell } from 'lucide-react'
import { cn } from '../lib/utils'
import { useUnreadCount } from '../features/notifications'
import { UnreadBadge } from './UnreadBadge'

export function NotificationBell({ variant }: { variant: 'top' | 'bottom' }) {
  const unread = useUnreadCount()
  const count = unread.data ?? 0

  return (
    <NavLink
      to="/notifications"
      className={({ isActive }) =>
        cn(
          'relative transition-colors',
          variant === 'top'
            ? cn(
                'flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium',
                isActive
                  ? 'bg-primary-container/15 text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
              )
            : cn(
                'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium',
                isActive ? 'text-primary' : 'text-on-surface-variant',
              ),
        )
      }
    >
      <span className="relative">
        <Bell className={variant === 'top' ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={1.5} aria-hidden />
        <UnreadBadge count={count} />
      </span>
      Notifications
    </NavLink>
  )
}

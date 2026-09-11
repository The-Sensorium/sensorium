import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { Ellipsis, type LucideIcon } from 'lucide-react'
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
  end?: boolean
}

// Only the daily workflow stays top-level; the rest lives under More so the
// header (and the mobile tab bar) never grows past four entries.
const PRIMARY_COUNT = 3

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

function splitItems(items: readonly StaffNavItem[]) {
  return {
    primary: items.slice(0, PRIMARY_COUNT),
    overflow: items.slice(PRIMARY_COUNT),
  }
}

function useOverflowState(overflow: readonly StaffNavItem[]) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const active = overflow.some((item) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`),
  )
  return { open, setOpen, active }
}

export function StaffNavigation({ items }: { items: readonly StaffNavItem[] }) {
  const unread = useStaffUnreadCounts()
  const { primary, overflow } = splitItems(items)
  const { open, setOpen, active } = useOverflowState(overflow)
  const overflowUnread = overflow.reduce((sum, item) => sum + unreadCountFor(item.unreadKey, unread.data), 0)

  return (
    <nav className="hidden items-center gap-1 lg:flex" aria-label="Staff navigation">
      {primary.map((item) => {
        const count = unreadCountFor(item.unreadKey, unread.data)
        return (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            <span className="relative">
              <item.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              <UnreadBadge count={count} />
            </span>
            {item.label}
          </NavLink>
        )
      })}
      {overflow.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="menu"
            className={cn(
              'flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-medium transition-colors',
              open || active
                ? 'bg-primary-container/15 text-primary'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
            )}
          >
            <span className="relative">
              <Ellipsis className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              <UnreadBadge count={overflowUnread} />
            </span>
            More
          </button>
          {open && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div role="menu" className="absolute right-0 z-20 mt-1 min-w-44 rounded-2xl border border-outline-variant/60 bg-surface p-1 shadow-soft">
                {overflow.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary-container/15 text-primary'
                          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </nav>
  )
}

/** Mobile bottom tab bar for staff pages, matching the member app shell. Must be
 rendered as a sibling of the sticky header (a backdrop-filtered ancestor
 becomes the containing block for `fixed` children). Its height maps to
 --bottom-nav-offset so page furniture sits flush on it. */
export function StaffMobileNav({ items }: { items: readonly StaffNavItem[] }) {
  const unread = useStaffUnreadCounts()
  const { primary, overflow } = splitItems(items)
  const { open, setOpen, active } = useOverflowState(overflow)
  const overflowUnread = overflow.reduce((sum, item) => sum + unreadCountFor(item.unreadKey, unread.data), 0)

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 cursor-default lg:hidden"
        />
      )}
      {open && overflow.length > 0 && (
        <div role="menu" className="fixed inset-x-4 bottom-[calc(var(--bottom-nav-offset)+8px)] z-20 rounded-2xl border border-outline-variant/60 bg-surface p-1 shadow-soft lg:hidden">
          {overflow.map((item) => {
            const count = unreadCountFor(item.unreadKey, unread.data)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-container/15 text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                  )
                }
              >
                <span className="relative">
                  <item.icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                  <UnreadBadge count={count} />
                </span>
                {item.label}
              </NavLink>
            )
          })}
        </div>
      )}
      <nav
        aria-label="Staff navigation"
        className="fixed inset-x-0 bottom-0 z-20 h-[var(--bottom-nav-offset)] border-t border-outline-variant/60 bg-surface/95 backdrop-blur lg:hidden"
      >
        <ul className="mx-auto flex h-full max-w-6xl items-stretch justify-around">
          {primary.map((item) => {
            const count = unreadCountFor(item.unreadKey, unread.data)
            return (
              <li key={item.to} className="flex h-full flex-1 items-center justify-center">
                <NavLink
                  to={item.to}
                  end={item.end}
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
          {overflow.length > 0 && (
            <li className="flex h-full flex-1 items-center justify-center">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-haspopup="menu"
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  open || active ? 'text-primary' : 'text-on-surface-variant',
                )}
              >
                <span className="relative">
                  <Ellipsis className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                  <UnreadBadge count={overflowUnread} />
                </span>
                More
              </button>
            </li>
          )}
        </ul>
      </nav>
    </>
  )
}

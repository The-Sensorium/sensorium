import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AtSign,
  Bell,
  CalendarDays,
  Flag,
  Heart,
  Loader2,
  LockOpen,
  MailOpen,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessageSquareWarning,
  MoreHorizontal,
  PartyPopper,
  Scale,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { toErrorMessage } from '../lib/error'
import { cn } from '../lib/utils'
import { Modal } from '../components/Modal'
import {
  notificationTarget,
  timeAgo,
  useClearAllNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMyNotifications,
  type MyNotification,
  type NotificationType,
} from '../features/notifications'

const ICONS: Record<NotificationType, typeof Bell> = {
  message: MessageSquare,
  mention: AtSign,
  reaction: Heart,
  vote_started: Scale,
  vote_result: Scale,
  cluster_formed: PartyPopper,
  invitation_received: MailOpen,
  signal_new: Megaphone,
  replacement: UserPlus,
  unlocked: LockOpen,
  queue_update: Users,
  moderation_notice: ShieldCheck,
  post_comment: MessageCircle,
  post_like: Heart,
  report_new: Flag,
  appeal_new: MessageSquareWarning,
  meetup_invite: CalendarDays,
  meetup_confirmed: CalendarDays,
  meetup_reminder_24h: CalendarDays,
  meetup_reminder_15m: CalendarDays,
  meetup_starting: CalendarDays,
}

export function NotificationsPage() {
  useDocumentTitle('Notifications')
  const navigate = useNavigate()
  const notifications = useMyNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const clearAll = useClearAllNotifications()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuAbove, setMenuAbove] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const menuWrapRef = useRef<HTMLDivElement>(null)

  const items = notifications.data ?? []
  const unread = items.filter((n) => n.read_at === null).length
  const visible = filter === 'unread' ? items.filter((n) => n.read_at === null) : items

  useEffect(() => {
    if (!menuOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  function toggleMenu() {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    const wrap = menuWrapRef.current
    if (wrap) {
      const rect = wrap.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom
      setMenuAbove(below < 120 && rect.top > below)
    } else {
      setMenuAbove(false)
    }
    setMenuOpen(true)
  }

  async function handleClick(n: MyNotification) {
    if (n.read_at === null) {
      markRead.mutate(n.id)
    }
    const target = notificationTarget(n)
    if (target) navigate(target.to)
  }

  async function handleClear() {
    try {
      await clearAll.mutateAsync()
      setConfirmOpen(false)
      setMenuOpen(false)
    } catch {
      // Surfaced via clearAll.error inside the dialog; stay open to retry.
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="font-display text-3xl font-semibold text-on-surface">Notifications</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {unread > 0 ? `${unread} unread` : 'You’re all caught up'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void markAll.mutateAsync()}
            disabled={items.length === 0 || markAll.isPending}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-outline-variant/60 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            {markAll.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Mark all read
          </button>
          <div ref={menuWrapRef} className="relative">
            <button
              type="button"
              aria-label="More notification options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={toggleMenu}
              disabled={items.length === 0}
              className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-full border border-outline-variant/60 text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
            >
              <MoreHorizontal className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close notification options"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setMenuOpen(false)}
                  tabIndex={-1}
                />
                <div
                  role="menu"
                  aria-label="Notification options"
                  className={cn(
                    'absolute right-0 z-20 flex w-56 flex-col gap-1 rounded-2xl border border-outline-variant/60 bg-surface p-2 shadow-lift',
                    menuAbove ? 'bottom-full mb-2' : 'top-full mt-1',
                  )}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmOpen(true)
                    }}
                    className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-error transition-colors hover:bg-error/10"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    Clear all notifications
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {items.length > 0 ? (
        <div
          role="group"
          aria-label="Notification filter"
          className="flex rounded-pill border border-outline-variant/60 bg-surface p-1"
        >
          <button
            type="button"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
            className={cn(
              'min-h-[44px] flex-1 rounded-pill px-4 py-2 text-sm font-semibold transition-colors',
              filter === 'all'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-container',
            )}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={filter === 'unread'}
            onClick={() => setFilter('unread')}
            className={cn(
              'min-h-[44px] flex-1 rounded-pill px-4 py-2 text-sm font-semibold transition-colors',
              filter === 'unread'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:bg-surface-container',
            )}
          >
            Unread{unread > 0 ? ` · ${unread}` : ''}
          </button>
        </div>
      ) : null}

      {notifications.isLoading ? (
        <NotificationSkeleton />
      ) : notifications.isError ? (
        <div className="rounded-2xl border border-error/30 bg-error/10 p-10 text-center">
          <Bell className="mx-auto h-7 w-7 text-error" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm font-semibold text-error">Couldn’t load your notifications</p>
          <p className="mt-1 text-sm text-on-surface-variant">
            Something went wrong while fetching them. Please try again.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
          <Bell className="mx-auto h-7 w-7 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">
            No notifications yet. Activity from your clusters will show up here.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center">
          <Bell className="mx-auto h-7 w-7 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-sm text-on-surface-variant">
            You’re all caught up. Nothing unread right now.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((n) => {
            const Icon = ICONS[n.type] ?? Bell
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void handleClick(n)}
                  className={cn(
                    'flex w-full items-start gap-4 rounded-2xl border p-4 text-left shadow-soft transition-colors hover:bg-surface-container/60',
                    n.read_at === null
                      ? 'border-primary/30 bg-primary-container/10'
                      : 'border-outline-variant/60 bg-surface',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                      n.read_at === null
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant',
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-on-surface">{n.title}</span>
                      <span className="shrink-0 text-xs text-on-surface-variant">{timeAgo(n.created_at)}</span>
                    </span>
                    {n.body ? (
                      <span className="mt-0.5 block truncate text-sm text-on-surface-variant">{n.body}</span>
                    ) : null}
                  </span>
                  {n.read_at === null ? (
                    <span aria-label="Unread" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!clearAll.isPending) setConfirmOpen(false)
        }}
        title="Clear all notifications?"
      >
        <p className="mt-3 text-sm text-on-surface-variant">
          This will permanently remove all notifications from your list. This action can't be undone.
        </p>
        {clearAll.error && (
          <p role="alert" className="mt-3 text-sm text-error">
            {toErrorMessage(clearAll.error, 'Could not clear notifications. Please try again.')}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            disabled={clearAll.isPending}
            className="min-h-[44px] rounded-pill px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={clearAll.isPending}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-error px-5 py-3 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {clearAll.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {clearAll.isPending ? 'Clearing…' : 'Clear all'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function NotificationSkeleton() {
  return (
    <ul className="space-y-2">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex animate-pulse items-start gap-4 rounded-2xl border border-outline-variant/60 bg-surface p-4">
          <span className="h-10 w-10 rounded-xl bg-surface-container" />
          <span className="flex-1 space-y-2">
            <span className="block h-4 w-1/2 rounded-full bg-surface-container" />
            <span className="block h-3 w-3/4 rounded-full bg-surface-container/70" />
          </span>
        </li>
      ))}
    </ul>
  )
}

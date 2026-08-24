import { useNavigate } from 'react-router'
import {
  AtSign,
  Bell,
  Gavel,
  Heart,
  LifeBuoy,
  Loader2,
  LockOpen,
  MailOpen,
  MessageCircle,
  MessageSquare,
  PartyPopper,
  ShieldCheck,
  UserPlus,
  Users,
  Vote,
} from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { cn } from '../lib/utils'
import {
  notificationTarget,
  timeAgo,
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
  vote_started: Vote,
  vote_result: Gavel,
  cluster_formed: PartyPopper,
  invitation_received: MailOpen,
  signal_new: LifeBuoy,
  replacement: UserPlus,
  unlocked: LockOpen,
  queue_update: Users,
  moderation_notice: ShieldCheck,
  post_comment: MessageCircle,
  post_like: Heart,
}

export function NotificationsPage() {
  useDocumentTitle('Notifications')
  const navigate = useNavigate()
  const notifications = useMyNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  const items = notifications.data ?? []
  const unread = items.filter((n) => n.read_at === null).length

  async function handleClick(n: MyNotification) {
    if (n.read_at === null) {
      markRead.mutate(n.id)
    }
    const target = notificationTarget(n)
    if (target) navigate(target.to)
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
        <button
          type="button"
          onClick={() => void markAll.mutateAsync()}
          disabled={unread === 0 || markAll.isPending}
          className="inline-flex items-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
        >
          {markAll.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Mark all read
        </button>
      </header>

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
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
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

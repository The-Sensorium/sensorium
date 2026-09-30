import { Link } from 'react-router'
import type { ReactNode } from 'react'
import { ChevronRight, Megaphone } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { DayDivider } from './DayDivider'
import { dateTimeFormatter } from './format'
import { Avatar } from '../../../components/Avatar'
import type { Signal, SignalStatus } from '../../../features/signals'

const SIGNAL_STATUS: Record<SignalStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-primary/10 text-primary' },
  in_progress: { label: 'In progress', className: 'bg-tertiary-container/25 text-tertiary' },
  resolved: { label: 'Resolved', className: 'bg-surface-container text-on-surface-variant' },
}

export function SignalRow({
  signal,
  author,
  isMine,
  replyCount,
  clusterId,
  showDay,
  mutedBanner,
}: {
  signal: Signal
  author: { display_name: string; avatar_url: string | null } | undefined
  isMine: boolean
  replyCount: number
  clusterId: string
  showDay: boolean
  mutedBanner?: ReactNode
}) {
  return (
    <li>
      {showDay && <DayDivider iso={signal.created_at} />}
      {mutedBanner}
      <Link
        to={`/cluster/${clusterId}/signals/${signal.id}`}
        className="my-1 flex items-center gap-2.5 rounded-xl border border-outline-variant/40 bg-surface-container px-3 py-2.5 transition-colors hover:border-outline/60"
      >
        <span className="shrink-0">
          {author?.avatar_url ? (
            <Avatar
              name={author?.display_name ?? 'Member'}
              src={author.avatar_url}
              className="h-6 w-6"
              textClassName="text-[11px]"
            />
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-surface text-tertiary">
              <Megaphone className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block line-clamp-2 text-sm font-medium leading-5 text-on-surface">
            {signal.prompt}
          </span>
          <span className="mt-1 block truncate text-xs text-on-surface-variant">
            {author?.display_name ?? 'Member'}
            {isMine ? ' (you)' : ''} · {dateTimeFormatter.format(new Date(signal.created_at))}
          </span>
          <span className="mt-0.5 block text-xs text-on-surface-variant">
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={cn('rounded-pill px-2.5 py-0.5 text-xs font-medium', SIGNAL_STATUS[signal.status].className)}>
            {SIGNAL_STATUS[signal.status].label}
          </span>
          <ChevronRight className="h-4 w-4 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
        </span>
      </Link>
    </li>
  )
}

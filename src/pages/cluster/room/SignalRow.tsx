import { Link } from 'react-router'
import { Megaphone } from 'lucide-react'
import { DayDivider } from './DayDivider'
import { dateTimeFormatter } from './format'
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
}: {
  signal: Signal
  author: { display_name: string; avatar_url: string | null } | undefined
  isMine: boolean
  replyCount: number
  clusterId: string
  showDay: boolean
}) {
  return (
    <li>
      {showDay && <DayDivider iso={signal.created_at} />}
      <Link
        to={`/cluster/${clusterId}/signals/${signal.id}`}
        className="my-1 flex items-start gap-2.5 rounded-xl border border-outline-variant/40 bg-surface-low/60 px-3 py-2.5 transition-colors hover:border-outline/60"
      >
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tertiary-container/25 text-tertiary">
          <Megaphone className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block line-clamp-2 text-sm leading-5 text-on-surface">
            {signal.prompt}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-on-surface-variant">
            {author?.display_name ?? 'Member'}
            {isMine ? ' (you)' : ''} ·{' '}
            {dateTimeFormatter.format(new Date(signal.created_at))} ·{' '}
            <span className="font-medium text-on-surface-variant">
              {SIGNAL_STATUS[signal.status].label}
            </span>
            <span>· {replyCount} replies</span>
          </span>
        </span>
      </Link>
    </li>
  )
}

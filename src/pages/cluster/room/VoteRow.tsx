import { Link } from 'react-router'
import { ChevronRight, Scale } from 'lucide-react'
import { DayDivider } from './DayDivider'
import { dateTimeFormatter } from './format'
import { CountdownTimer } from '../../../components/CountdownTimer'
import type { Vote } from '../../../features/votes'

export function VoteRow({
  vote,
  initiator,
  target,
  isMine,
  clusterId,
  showDay,
}: {
  vote: Vote
  initiator: { display_name: string; avatar_url: string | null } | undefined
  target: { display_name: string; avatar_url: string | null } | undefined
  isMine: boolean
  clusterId: string
  showDay: boolean
}) {
  const title =
    vote.type === 'change_name'
      ? `Rename to "${vote.name_suggestion ?? '?'}"`
      : vote.type === 'replace_member'
        ? `Replace ${target?.display_name ?? 'a member'}`
        : 'Choose a new member'
  const isOpen = vote.status === 'open'
  return (
    <li>
      {showDay && <DayDivider iso={vote.created_at} />}
      <Link
        to={`/cluster/${clusterId}/votes`}
        className="my-1 flex items-center gap-2.5 rounded-xl border border-outline-variant/40 bg-surface-container px-3 py-2.5 transition-colors hover:border-outline/60"
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Scale className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block line-clamp-2 text-sm font-medium leading-5 text-on-surface">
            {title}
          </span>
          <span className="mt-1 block truncate text-xs text-on-surface-variant">
            {initiator?.display_name ?? 'Member'}
            {isMine ? ' (you)' : ''} · {dateTimeFormatter.format(new Date(vote.created_at))}
          </span>
          {isOpen ? (
            <span className="mt-0.5 block text-xs text-on-surface-variant">
              Ends in <CountdownTimer deadline={vote.closes_at} />
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={
              isOpen
                ? 'rounded-pill bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'
                : 'rounded-pill bg-surface-container px-2.5 py-0.5 text-xs font-medium text-on-surface-variant'
            }
          >
            {isOpen ? 'Open' : 'Closed'}
          </span>
          <ChevronRight className="h-4 w-4 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
        </span>
      </Link>
    </li>
  )
}

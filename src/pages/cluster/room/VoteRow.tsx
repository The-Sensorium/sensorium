import { Link } from 'react-router'
import { Scale } from 'lucide-react'
import { DayDivider } from './DayDivider'
import { dateTimeFormatter } from './format'
import { CountdownTimer } from '../../../components/CountdownTimer'
import type { Vote } from '../../../features/votes'

const VOTE_TYPE_LABEL: Record<Vote['type'], string> = {
  replace_member: 'Replace a member',
  change_name: 'Rename the cluster',
  select_candidate: 'Choose a new member',
}

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
  return (
    <li>
      {showDay && <DayDivider iso={vote.created_at} />}
      <Link
        to={`/cluster/${clusterId}/votes`}
        className="my-1 flex items-start gap-2.5 rounded-xl border border-outline-variant/40 bg-surface-container px-3 py-2.5 transition-colors hover:border-outline/60"
      >
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Scale className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block line-clamp-2 text-sm leading-5 text-on-surface">
            {VOTE_TYPE_LABEL[vote.type]}: {title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-on-surface-variant">
            {initiator?.display_name ?? 'Member'}
            {isMine ? ' (you)' : ''} ·{' '}
            {dateTimeFormatter.format(new Date(vote.created_at))} · Ends in{' '}
            <CountdownTimer deadline={vote.closes_at} />
          </span>
        </span>
      </Link>
    </li>
  )
}

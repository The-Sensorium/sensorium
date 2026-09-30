import { Link } from 'react-router'
import { cn } from '../../../lib/utils'
import { parseMentions, type MentionMember } from '../../../features/mentions'
import { LinkifiedText } from '../../../components/LinkifiedText'

/** Renders message content, turning `@DisplayName` mentions into profile links and `@everyone` into a plain chip. */
export function MentionText({
  content,
  members,
  clusterId,
  mine = false,
}: {
  content: string
  members: MentionMember[]
  clusterId: string
  mine?: boolean
}) {
  const parts = parseMentions(content, members)
  const chip = mine
    ? 'bg-on-primary/25 text-on-primary'
    : 'bg-primary/10 text-primary'
  return (
    <span>
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <LinkifiedText key={i} text={part.value} tone={mine ? 'on-primary' : 'default'} />
        ) : part.type === 'everyone' ? (
          <span key={i}>
            {part.prefix}
            <span
              title={part.name}
              className={cn('rounded-sm px-1 py-0.5 font-medium', chip)}
            >
              @{part.name}
            </span>
          </span>
        ) : (
          <span key={i}>
            {part.prefix}
            <Link
              to={`/profile/${part.id}?cluster=${clusterId}`}
              title={part.name}
              className={cn(
                'rounded-sm px-1 py-0.5 font-medium transition-colors',
                chip,
                mine ? 'hover:bg-on-primary/40' : 'hover:bg-primary/20',
              )}
            >
              @{part.name}
            </Link>
          </span>
        ),
      )}
    </span>
  )
}

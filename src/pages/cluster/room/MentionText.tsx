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
  const incomingChip = 'bg-primary/10 text-primary'
  return (
    <span>
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <LinkifiedText key={i} text={part.value} tone={mine ? 'on-primary' : 'default'} />
        ) : part.type === 'everyone' ? (
          <span key={i}>
            {part.prefix}
            {mine ? (
              <span
                title={part.name}
                className="font-semibold text-on-primary underline decoration-on-primary/50 underline-offset-2"
              >
                @{part.name}
              </span>
            ) : (
              <span title={part.name} className={cn('rounded-sm px-1 py-0.5 font-medium', incomingChip)}>
                @{part.name}
              </span>
            )}
          </span>
        ) : (
          <span key={i}>
            {part.prefix}
            {mine ? (
              <Link
                to={`/profile/${part.id}?cluster=${clusterId}`}
                title={part.name}
                className="font-semibold text-on-primary underline decoration-on-primary/50 underline-offset-2 transition-colors hover:opacity-80"
              >
                @{part.name}
              </Link>
            ) : (
              <Link
                to={`/profile/${part.id}?cluster=${clusterId}`}
                title={part.name}
                className={cn(
                  'rounded-sm px-1 py-0.5 font-medium transition-colors',
                  incomingChip,
                  'hover:bg-primary/20',
                )}
              >
                @{part.name}
              </Link>
            )}
          </span>
        ),
      )}
    </span>
  )
}

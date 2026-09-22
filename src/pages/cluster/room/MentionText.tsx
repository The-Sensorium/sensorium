import { Link } from 'react-router'
import { parseMentions, type MentionMember } from '../../../features/mentions'

/** Renders message content, turning `@DisplayName` mentions into profile links and `@everyone` into a plain chip. */
export function MentionText({
  content,
  members,
  clusterId,
}: {
  content: string
  members: MentionMember[]
  clusterId: string
}) {
  const parts = parseMentions(content, members)
  return (
    <span>
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <span key={i}>{part.value}</span>
        ) : part.type === 'everyone' ? (
          <span key={i}>
            {part.prefix}
            <span
              title={part.name}
              className="rounded-sm bg-primary/10 px-1 py-0.5 font-medium text-primary"
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
              className="rounded-sm bg-primary/10 px-1 py-0.5 font-medium text-primary transition-colors hover:bg-primary/20"
            >
              @{part.name}
            </Link>
          </span>
        ),
      )}
    </span>
  )
}

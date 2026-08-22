import { Link } from 'react-router'
import { Avatar } from '../../../components/Avatar'

export function TypingBubble({
  name,
  avatarUrl,
  clusterId,
  userId,
}: {
  name: string
  avatarUrl: string | null
  clusterId: string
  userId: string
}) {
  return (
    <li role="status" aria-label={`${name} is typing…`} className="flex items-start gap-2 py-1">
      <Link
        to={`/profile/${userId}?cluster=${clusterId}`}
        title={name}
        className="mt-6 shrink-0"
      >
        <Avatar name={name} src={avatarUrl} className="h-7 w-7" textClassName="text-xs" />
      </Link>
      <div className="flex items-center rounded-2xl rounded-bl-md bg-surface-container px-4 py-3 shadow-soft">
        <span className="flex items-center gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="typing-dot h-1.5 w-1.5 rounded-full bg-on-surface-variant/60"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </span>
      </div>
    </li>
  )
}

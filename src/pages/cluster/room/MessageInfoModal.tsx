import { Link } from 'react-router'
import { CheckCheck } from 'lucide-react'
import { Modal } from '../../../components/Modal'
import { Avatar } from '../../../components/Avatar'
import { dateTimeFormatter } from './format'
import type { SeenByMember } from './seen-by'

function MemberList({
  members,
  clusterId,
  empty,
}: {
  members: SeenByMember[]
  clusterId: string
  empty: string
}) {
  if (members.length === 0) {
    return <p className="text-sm text-on-surface-variant">{empty}</p>
  }
  return (
    <ul className="space-y-2">
      {members.map((m) => (
        <li key={m.id}>
          <Link
            to={`/profile/${m.id}?cluster=${clusterId}`}
            className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-container"
          >
            <Avatar name={m.display_name} src={m.avatar_url} className="h-8 w-8" textClassName="text-sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">
              {m.display_name}
            </span>
            {m.read_at && (
              <span className="flex shrink-0 items-center gap-1 text-xs text-on-surface-variant">
                <CheckCheck className="h-3.5 w-3.5 text-primary" strokeWidth={2} aria-hidden />
                {dateTimeFormatter.format(new Date(m.read_at))}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function MessageInfoModal({
  open,
  onClose,
  clusterId,
  seen,
  notSeen,
}: {
  open: boolean
  onClose(): void
  clusterId: string
  seen: SeenByMember[]
  notSeen: SeenByMember[]
}) {
  return (
    <Modal open={open} onClose={onClose} title="Message info">
      <div className="mt-4 space-y-4">
        <section aria-label="Seen by" className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Seen by
          </h3>
          <MemberList members={seen} clusterId={clusterId} empty="No one has seen it yet." />
        </section>
        <section aria-label="Not seen yet" className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Not seen yet
          </h3>
          <MemberList
            members={notSeen}
            clusterId={clusterId}
            empty="Everyone has seen it."
          />
        </section>
      </div>
    </Modal>
  )
}

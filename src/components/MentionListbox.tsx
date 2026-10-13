import { Users } from 'lucide-react'
import { cn } from '../lib/utils'
import { Avatar } from './Avatar'
import type { MentionMember } from '../features/mentions'

/**
 * Shared @-mention suggestion dropdown, extracted from the chat composer.
 * Presentational only: the caller owns the query state, the active index,
 * and insertion. IDs and roles stay stable so inputs can wire
 * aria-activedescendant against them.
 */
export function MentionListbox({
  candidates,
  showEveryone,
  mentionIndex,
  onSelectEveryone,
  onSelectMember,
}: {
  candidates: MentionMember[]
  showEveryone: boolean
  mentionIndex: number
  onSelectEveryone(): void
  onSelectMember(member: MentionMember): void
}) {
  return (
    <div
      id="mention-listbox"
      role="listbox"
      aria-label="Mention a member"
      className="absolute bottom-full left-0 z-20 mb-2 w-max min-w-44 max-w-full overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface p-2 shadow-soft"
    >
      {showEveryone && (
        <button
          key="everyone"
          id="mention-option-0"
          type="button"
          role="option"
          aria-selected={mentionIndex === 0}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSelectEveryone}
          className={cn(
            'flex min-h-[44px] w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm text-on-surface transition-colors sm:min-h-0 sm:py-2',
            mentionIndex === 0 ? 'bg-surface-container' : 'hover:bg-surface-container/60',
          )}
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-container/25 text-primary" aria-hidden>
            <Users className="h-4 w-4" strokeWidth={1.5} />
          </span>
          <span className="truncate">everyone</span>
        </button>
      )}
      {candidates.map((candidate, i) => {
        const index = i + (showEveryone ? 1 : 0)
        return (
          <button
            key={candidate.id}
            id={`mention-option-${index}`}
            type="button"
            role="option"
            aria-selected={index === mentionIndex}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelectMember(candidate)}
            className={cn(
              'flex min-h-[44px] w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm text-on-surface transition-colors sm:min-h-0 sm:py-2',
              index === mentionIndex ? 'bg-surface-container' : 'hover:bg-surface-container/60',
            )}
          >
            <Avatar
              name={candidate.display_name}
              src={candidate.avatar_url}
              className="h-6 w-6"
              textClassName="text-xs"
            />
            <span className="truncate">{candidate.display_name}</span>
          </button>
        )
      })}
    </div>
  )
}

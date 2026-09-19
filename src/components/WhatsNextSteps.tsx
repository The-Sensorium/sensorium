import { Bell, Clock, MessageSquare } from 'lucide-react'
import { cn } from '../lib/utils'
import { CLUSTER_SIZE } from '../lib/constants'

export function WhatsNextSteps({
  className,
  compact = false,
  section = true,
}: {
  className?: string
  compact?: boolean
  section?: boolean
}) {
  const heading = (
    <h2
      className={cn(
        'font-semibold text-on-surface',
        compact ? 'text-xs' : 'text-sm',
      )}
    >
      What happens next
    </h2>
  )
  const list = (
    <ol
      className={cn(
        'mt-3 space-y-2.5 text-on-surface-variant',
        compact ? 'text-xs leading-5' : 'text-sm leading-6',
      )}
    >
        <li className="flex items-start gap-2">
          <Bell
            className={cn('shrink-0 text-primary', compact ? 'mt-0.5 h-3.5 w-3.5' : 'mt-1 h-4 w-4')}
            strokeWidth={1.5}
            aria-hidden
          />
          <span>
            We&rsquo;ll notify you once {CLUSTER_SIZE} are in and your cluster forms.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Clock
            className={cn('shrink-0 text-primary', compact ? 'mt-0.5 h-3.5 w-3.5' : 'mt-1 h-4 w-4')}
            strokeWidth={1.5}
            aria-hidden
          />
          <span>
            Once your cluster forms, you have 72 hours to complete intros or you&rsquo;ll lose
            your spot.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <MessageSquare
            className={cn('shrink-0 text-primary', compact ? 'mt-0.5 h-3.5 w-3.5' : 'mt-1 h-4 w-4')}
            strokeWidth={1.5}
            aria-hidden
          />
          <span>Chat unlocks once everyone answers.</span>
        </li>
      </ol>
  )
  if (!section) {
    return (
      <div data-e2e="whats-next-steps" className={className}>
        {heading}
        {list}
      </div>
    )
  }
  return (
    <section aria-label="What happens next" data-e2e="whats-next-steps" className={className}>
      {heading}
      {list}
    </section>
  )
}

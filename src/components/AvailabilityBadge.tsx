import { cn } from '../lib/utils'
import { availabilityMeta, type Availability } from '../lib/moods'

export function AvailabilityBadge({
  value,
  showLabel = true,
}: {
  value: Availability
  showLabel?: boolean
}) {
  const meta = availabilityMeta(value)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
      <span className={cn('h-2 w-2 rounded-full', meta.dotClass)} aria-hidden />
      {showLabel ? meta.label : null}
      <span className="sr-only">{meta.label}</span>
    </span>
  )
}

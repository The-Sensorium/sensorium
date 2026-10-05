import { cn } from '../lib/utils'
import { profileStatusMeta, type DisplayStatus } from '../lib/profile-status'

export function ProfileStatusBadge({
  value,
  showLabel = true,
}: {
  value: DisplayStatus
  showLabel?: boolean
}) {
  const meta =
    value === 'offline'
      ? { label: 'Offline', dotClass: 'bg-on-surface-variant/30' }
      : profileStatusMeta(value)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
      <span className={cn('h-2 w-2 rounded-full', meta.dotClass)} aria-hidden />
      {showLabel ? meta.label : null}
      <span className="sr-only">{meta.label}</span>
    </span>
  )
}

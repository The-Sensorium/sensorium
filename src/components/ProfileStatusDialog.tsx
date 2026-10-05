import { Check } from 'lucide-react'
import { Modal } from './Modal'
import { PROFILE_STATUSES, type ProfileStatus } from '../lib/profile-status'
import { cn } from '../lib/utils'

export function ProfileStatusDialog({
  open,
  onClose,
  current,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  current: ProfileStatus
  onSelect: (value: ProfileStatus) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Set your status">
      <p className="mt-1 text-sm text-on-surface-variant">
        Your status is visible to your cluster.
      </p>
      <div role="radiogroup" aria-label="Profile status" className="mt-4 space-y-2">
        {PROFILE_STATUSES.map((status) => {
          const selected = status.value === current
          return (
            <button
              key={status.value}
              type="button"
              role="radio"
              aria-checked={selected}
              data-e2e={`status-option-${status.value}`}
              onClick={() => onSelect(status.value)}
              className={cn(
                'flex min-h-[64px] w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-outline-variant/60 bg-surface-container/40 hover:bg-surface-container',
              )}
            >
              <span
                className={cn('h-3 w-3 shrink-0 rounded-full', status.dotClass)}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-on-surface">
                  {status.label}
                </span>
                <span className="block text-sm text-on-surface-variant">
                  {status.description}
                </span>
              </span>
              {selected ? (
                <Check className="h-5 w-5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
              ) : null}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

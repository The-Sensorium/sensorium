import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import { MATCHING_MODES, type MatchingMode } from '../../lib/modes'
import type { OnboardingDraft } from './draft'

interface Props {
  draft: OnboardingDraft
  patch: (updates: Partial<OnboardingDraft>) => void
}

export function StepModes({ draft, patch }: Props) {
  function toggle(mode: MatchingMode) {
    const selected = draft.selectedModes.includes(mode)
    patch({
      selectedModes: selected
        ? draft.selectedModes.filter((m) => m !== mode)
        : [...draft.selectedModes, mode],
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-on-surface">How do you want to match?</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Pick at least one. Each mode forms its own independent cluster.
        </p>
      </div>

      <ul className="space-y-3">
        {MATCHING_MODES.map((mode) => {
          const active = draft.selectedModes.includes(mode.value)
          return (
            <li key={mode.value}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => toggle(mode.value)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors',
                  active
                    ? 'border-primary bg-primary-container/15'
                    : 'border-outline-variant/70 bg-surface hover:bg-surface-container',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
                    active
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-outline text-transparent',
                  )}
                >
                  <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-on-surface">{mode.label}</span>
                  <span className="block text-xs text-on-surface-variant">{mode.detail}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="text-xs leading-5 text-on-surface-variant">
        Interest-based matching is intentionally not offered. Clusters are built around life stages
        and place, not shared hobbies.
      </p>
    </div>
  )
}

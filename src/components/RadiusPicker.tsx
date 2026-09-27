import { cn } from '../lib/utils'
import { LOCAL_RADII, LOCAL_RADIUS_LABELS, type LocalRadius } from '../pages/onboarding/draft'

interface RadiusPickerProps {
  value: LocalRadius | null
  onChange: (next: LocalRadius) => void
  counts?: Partial<Record<LocalRadius, number | null>>
}

export function RadiusPicker({ value, onChange, counts }: RadiusPickerProps) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-on-surface">Matching radius</legend>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        {LOCAL_RADII.map((radius) => {
          const count = counts?.[radius] ?? null
          return (
            <button
              key={radius}
              type="button"
              aria-pressed={value === radius}
              data-e2e={`radius-option-${radius}`}
              onClick={() => onChange(radius as LocalRadius)}
              className={cn(
                'min-h-[44px] flex-1 rounded-pill border px-2 py-2.5 text-sm font-semibold transition-colors',
                value === radius
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant/70 text-on-surface hover:bg-surface-container',
              )}
            >
              {radius} km
              <span className="block text-xs font-normal opacity-80">
                {LOCAL_RADIUS_LABELS[radius as LocalRadius]}
              </span>
              {count != null && (
                <span className="block text-xs font-normal opacity-80">
                  {count}/8
                </span>
              )}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

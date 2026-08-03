import { cn } from '../lib/utils'
import { MOODS, type Mood } from '../lib/moods'

export function MoodPicker({
  value,
  onChange,
  disabled,
  label = 'Set your mood',
  compact = false,
}: {
  value: Mood | null
  onChange: (mood: Mood) => void
  disabled?: boolean
  label?: string
  compact?: boolean
}) {
  return (
    <div>
      {!compact && (
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      )}
      <div className={cn('flex gap-1.5', compact ? '' : 'mt-2 flex-wrap')}>
        {MOODS.map((m) => {
          const active = value === m.value
          return (
            <button
              key={m.value}
              type="button"
              aria-pressed={active}
              aria-label={m.label}
              disabled={disabled}
              onClick={() => onChange(m.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-pill border transition-colors disabled:opacity-60',
                compact ? 'px-2.5 py-1.5 text-base leading-none' : 'px-3 py-1.5 text-sm',
                active
                  ? 'border-primary bg-primary/15 text-on-surface'
                  : 'border-outline-variant bg-surface-low text-on-surface-variant hover:border-primary/50 hover:text-on-surface',
              )}
            >
              <span aria-hidden>{m.emoji}</span>
              {!compact && <span className="hidden sm:inline">{m.label}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'

const PRONOUN_PRESETS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any pronouns'] as const
type PronounPreset = (typeof PRONOUN_PRESETS)[number]
const PRONOUN_CUSTOM = '__custom__'
type PronounMode = PronounPreset | '' | typeof PRONOUN_CUSTOM

const DEFAULT_FIELD =
  'rounded-pill border border-outline-variant/60 bg-surface-container/50 px-4 py-2.5 text-on-surface focus:border-primary placeholder:text-on-surface-variant'

function deriveMode(value: string): PronounMode {
  return PRONOUN_PRESETS.includes(value as PronounPreset)
    ? (value as PronounPreset)
    : value === ''
      ? ''
      : PRONOUN_CUSTOM
}

export function PronounSelect({
  value,
  onChange,
  fieldClassName,
}: {
  value: string
  onChange: (value: string) => void
  fieldClassName?: string
}) {
  const [mode, setMode] = useState<PronounMode>(() => deriveMode(value))

  useEffect(() => {
    setMode((m) => {
      const produced = m === PRONOUN_CUSTOM ? value : m
      return produced === value ? m : deriveMode(value)
    })
  }, [value])

  function handleSelect(next: string) {
    const nextMode = next as PronounMode
    setMode(nextMode)
    onChange(nextMode === PRONOUN_CUSTOM ? '' : nextMode)
  }

  return (
    <div>
      <div className="relative">
        <select
          value={mode}
          onChange={(e) => handleSelect(e.target.value)}
          aria-label="Pronouns"
          className={cn('mt-1.5 w-full appearance-none pr-10 text-sm focus:outline-none', fieldClassName ?? DEFAULT_FIELD)}
        >
          <option value="">Don’t share</option>
          {PRONOUN_PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value={PRONOUN_CUSTOM}>Something else</option>
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
          strokeWidth={1.5}
          aria-hidden
        />
      </div>
      {mode === PRONOUN_CUSTOM && (
        <div className="mt-1.5">
          <span className="text-sm font-semibold text-on-surface">Custom pronouns</span>
          <input
            type="text"
            value={value}
            maxLength={40}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. ze/zir, any pronouns"
            aria-label="Custom pronouns"
            className={cn('mt-1.5 w-full text-sm focus:outline-none', fieldClassName ?? DEFAULT_FIELD)}
          />
        </div>
      )}
    </div>
  )
}

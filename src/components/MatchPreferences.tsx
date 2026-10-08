import { useEffect, useState } from 'react'
import { CalendarDays, Clock, Loader2, Users } from 'lucide-react'
import { Modal } from './Modal'
import {
  LOCAL_AGE_MAX,
  LOCAL_AGE_MIN,
  useLocalCompatibleCount,
  useSetLocalAgePrefs,
} from '../features/matching'
import { toErrorMessage } from '../lib/error'

function clampValue(v: number): number {
  return Math.min(Math.max(LOCAL_AGE_MIN, v), LOCAL_AGE_MAX)
}

export function AgeRangePicker({
  min,
  max,
  onChange,
}: {
  min: number
  max: number
  onChange: (nextMin: number, nextMax: number) => void
}) {
  const span = LOCAL_AGE_MAX - LOCAL_AGE_MIN
  const loPct = ((min - LOCAL_AGE_MIN) / span) * 100
  const hiPct = ((max - LOCAL_AGE_MIN) / span) * 100

  return (
    <div>
      <p aria-live="polite" className="text-center font-display text-lg font-semibold text-on-surface">
        {min === LOCAL_AGE_MIN && max === LOCAL_AGE_MAX ? 'Any age' : `${min} to ${max} years`}
      </p>
      <div className="age-dual mt-2" role="group" aria-label="Age range">
        <div aria-hidden className="absolute top-1/2 right-0 left-0 h-2 -translate-y-1/2 rounded-pill bg-surface-highest" />
        <div
          aria-hidden
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-pill bg-primary"
          style={{ left: `${loPct}%`, width: `${Math.max(hiPct - loPct, 0)}%` }}
        />
        <input
          type="range"
          min={LOCAL_AGE_MIN}
          max={LOCAL_AGE_MAX}
          value={min}
          aria-label="Minimum age"
          data-e2e="age-min-slider"
          style={{ zIndex: min === max && min > LOCAL_AGE_MIN ? 5 : 3 }}
          onChange={(e) => onChange(Math.min(clampValue(Number(e.target.value)), max), max)}
        />
        <input
          type="range"
          min={LOCAL_AGE_MIN}
          max={LOCAL_AGE_MAX}
          value={max}
          aria-label="Maximum age"
          data-e2e="age-max-slider"
          style={{ zIndex: 4 }}
          onChange={(e) => onChange(min, Math.max(clampValue(Number(e.target.value)), min))}
        />
      </div>
      <div className="flex justify-between text-xs text-on-surface-variant" aria-hidden>
        <span>{LOCAL_AGE_MIN}</span>
        <span>{LOCAL_AGE_MAX}</span>
      </div>
    </div>
  )
}

export function MatchPreferencesSheet({
  open,
  onClose,
  queueKey,
  initialMin,
  initialMax,
}: {
  open: boolean
  onClose: () => void
  queueKey: string | null
  initialMin: number | null
  initialMax: number | null
}) {
  // Fresh draft per mount (callers only render while open), so background
  // profile refetches can never clobber an in-progress drag.
  const [min, setMin] = useState(initialMin ?? LOCAL_AGE_MIN)
  const [max, setMax] = useState(initialMax ?? LOCAL_AGE_MAX)
  const [error, setError] = useState<string | null>(null)
  const save = useSetLocalAgePrefs()
  const narrowed = min !== LOCAL_AGE_MIN || max !== LOCAL_AGE_MAX
  // Debounce the draft before counting (same 300ms as staff search), so one
  // query fires per pause instead of one per slider tick.
  const [debMin, setDebMin] = useState<number | null>(narrowed ? min : null)
  const [debMax, setDebMax] = useState<number | null>(narrowed ? max : null)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebMin(narrowed ? min : null)
      setDebMax(narrowed ? max : null)
    }, 300)
    return () => clearTimeout(timer)
  }, [min, max, narrowed])
  const live = useLocalCompatibleCount(open ? queueKey : null, debMin, debMax)

  async function onSave() {
    setError(null)
    try {
      const payload =
        min === LOCAL_AGE_MIN && max === LOCAL_AGE_MAX
          ? { min: null, max: null }
          : { min, max }
      await save.mutateAsync(payload)
      onClose()
    } catch (err) {
      const raw = toErrorMessage(err, '').toLowerCase()
      setError(
        raw.includes('invalid_age_range')
          ? 'Choose an age range between 18 and 99, or Any age.'
          : toErrorMessage(err, 'Could not save preferences.'),
      )
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Match preferences">
      <div className="mt-4 space-y-5">
        <p className="text-sm leading-6 text-on-surface-variant">
          Choose the age range you’re comfortable being grouped with.
        </p>

        <section aria-label="Age range">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden />
            <h3 className="flex-1 text-sm font-semibold text-on-surface">Age range</h3>
            <button
              type="button"
              disabled={!narrowed}
              onClick={() => {
                setMin(LOCAL_AGE_MIN)
                setMax(LOCAL_AGE_MAX)
              }}
              className="min-h-[44px] text-sm font-semibold text-primary hover:underline disabled:opacity-40"
            >
              Any age
            </button>
          </div>
          <div className="mt-3">
            <AgeRangePicker
              min={min}
              max={max}
              onChange={(lo, hi) => {
                setMin(lo)
                setMax(hi)
              }}
            />
          </div>
        </section>

        <div className="flex gap-3">
          <Users className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden />
          <div>
            <p className="min-h-6 text-sm font-semibold text-on-surface" aria-live="polite">
              {live.isError
                ? 'Match count unavailable right now.'
                : live.count != null
                  ? `${live.count} ${live.count === 1 ? 'person currently matches' : 'people currently match'}`
                  : null}
            </p>
            <p className="mt-1 text-sm leading-6 text-on-surface-variant">
              Join the Local Radius queue to be grouped with 7 people who match your preferences.
            </p>
          </div>
        </div>

        {narrowed && (
          <p className="flex items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-700 dark:text-amber-400">
            <Clock className="h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden />
            Narrower preferences may take longer to form a cluster.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={save.isPending}
          data-e2e="save-age-prefs"
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {save.isPending ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </Modal>
  )
}

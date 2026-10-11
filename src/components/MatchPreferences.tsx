import { useEffect, useState } from 'react'
import { CalendarDays, Clock, Loader2, Users } from 'lucide-react'
import { Modal } from './Modal'
import {
  AGE_MAX,
  AGE_MIN,
  LOCAL_AGE_MAX,
  LOCAL_AGE_MIN,
  OPEN_MIX_AGE_MAX,
  OPEN_MIX_AGE_MIN,
  useLocalCompatibleCount,
  useOpenMixCompatibleCount,
  useSetLocalAgePrefs,
  useSetOpenMixAgePrefs,
  type AgePrefMode,
} from '../features/matching'
import { toErrorMessage } from '../lib/error'

function clampValue(v: number): number {
  return Math.min(Math.max(AGE_MIN, v), AGE_MAX)
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
  const span = AGE_MAX - AGE_MIN
  const loPct = ((min - AGE_MIN) / span) * 100
  const hiPct = ((max - AGE_MIN) / span) * 100

  return (
    <div>
      <p aria-live="polite" className="text-center font-display text-lg font-semibold text-on-surface">
        {min === AGE_MIN && max === AGE_MAX ? 'Any age' : `${min} to ${max} years`}
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
          min={AGE_MIN}
          max={AGE_MAX}
          value={min}
          aria-label="Minimum age"
          data-e2e="age-min-slider"
          style={{ zIndex: min === max && min > AGE_MIN ? 5 : 3 }}
          onChange={(e) => onChange(Math.min(clampValue(Number(e.target.value)), max), max)}
        />
        <input
          type="range"
          min={AGE_MIN}
          max={AGE_MAX}
          value={max}
          aria-label="Maximum age"
          data-e2e="age-max-slider"
          style={{ zIndex: 4 }}
          onChange={(e) => onChange(min, Math.max(clampValue(Number(e.target.value)), min))}
        />
        </div>
      <div className="flex justify-between text-xs text-on-surface-variant" aria-hidden>
        <span>{AGE_MIN}</span>
        <span>{AGE_MAX}</span>
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
  mode = 'local',
}: {
  open: boolean
  onClose: () => void
  queueKey: string | null
  initialMin: number | null
  initialMax: number | null
  mode?: AgePrefMode
}) {
  // Per-mode Any-age bounds (both 18/99 today): the draft, the narrowed
  // check, and the save payload all read the active mode's constants so a
  // future range divergence cannot desync the UI from the DB CHECK.
  const rangeMin = mode === 'local' ? LOCAL_AGE_MIN : OPEN_MIX_AGE_MIN
  const rangeMax = mode === 'local' ? LOCAL_AGE_MAX : OPEN_MIX_AGE_MAX
  // Fresh draft per mount (callers only render while open), so background
  // profile refetches can never clobber an in-progress drag.
  const [min, setMin] = useState(initialMin ?? rangeMin)
  const [max, setMax] = useState(initialMax ?? rangeMax)
  const [error, setError] = useState<string | null>(null)
  const saveLocal = useSetLocalAgePrefs()
  const saveOpenMix = useSetOpenMixAgePrefs()
  const save = mode === 'local' ? saveLocal : saveOpenMix
  const narrowed = min !== rangeMin || max !== rangeMax
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
  const localLive = useLocalCompatibleCount(
    mode === 'local' && open ? queueKey : null,
    debMin,
    debMax,
  )
  const openMixLive = useOpenMixCompatibleCount(
    mode === 'open_mix' && open ? queueKey : null,
    debMin,
    debMax,
  )
  const live = mode === 'local' ? localLive : openMixLive

  async function onSave() {
    setError(null)
    try {
      const payload =
        min === rangeMin && max === rangeMax ? { min: null, max: null } : { min, max }
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
                setMin(rangeMin)
                setMax(rangeMax)
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
              {mode === 'local'
                ? 'Join the Local Radius queue to be grouped with 7 people who match your preferences.'
                : 'Join the Open Mix queue to be grouped with 7 people who match your preferences.'}
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

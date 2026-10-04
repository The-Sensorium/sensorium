import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Avatar } from '../../components/Avatar'
import { CalendarDays, CalendarPlus, ChevronDown, Clock, Globe, Loader2, Moon, MoreVertical, Plus, Sun, Trash2 } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { rateLimitMessage } from '../../lib/error'
import { MEETUP_ENABLED, MEETUP_MAX_SLOTS, MEETUP_SLOT_LENGTH_MS, defaultCustomStart, formatPillDate, isCustomSlotValid, previewSlotMembers } from '../../lib/meetup'
import { defaultTimeZone, isValidTimeZone, timeZoneList, zonedDateInput, zonedTimeInput, zonedTimeToISO } from '../../lib/timezones'
import { useAuth } from '../../app/auth-context'
import { useClusterMembers } from '../../features/matching'
import { useCreateMeetup } from '../../features/meetups'

interface CustomRow {
  day: string
  time: string
}

/** Wall-clock strings for the prefill instant, rendered in the given zone. */
function defaultRowForZone(zone: string): CustomRow {
  const iso = defaultCustomStart().toISOString()
  return {
    day: zonedDateInput(iso, zone) ?? '',
    time: zonedTimeInput(iso, zone) ?? '',
  }
}

/**
 * Overflow menu for one ballot option. Mirrors MemberCardMenu styling: a
 * `...` trigger, a fixed backdrop, an Escape-dismissed menu. The only action
 * is removing the option, disabled while it is the last row.
 */
function OptionMenu({
  index,
  canRemove,
  onRemove,
}: {
  index: number
  canRemove: boolean
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const onCloseRef = useRef(() => setOpen(false))

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={`More options for option ${index + 1}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-11 w-11 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <MoreVertical className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close option menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <div
            role="menu"
            aria-label={`Options for option ${index + 1}`}
            className="absolute right-0 top-full z-40 mt-1 flex w-44 flex-col gap-1 rounded-2xl border border-outline-variant/60 bg-surface p-2 shadow-lift"
          >
            <button
              type="button"
              role="menuitem"
              disabled={!canRemove}
              onClick={() => {
                onRemove()
                setOpen(false)
              }}
              className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-error transition-colors hover:bg-error/10 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Remove option
            </button>
            {!canRemove && (
              <p className="px-3 pb-1 text-xs text-on-surface-variant">
                Add another time to remove this one.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Pill-styled wrapper around a native date/time input. The input covers the
 * pill invisibly so taps land on it, and the label click explicitly opens
 * the native picker: overlay clicks only focus the input in some browsers
 * instead of opening the popup.
 */
function PillInput({
  label,
  type,
  value,
  min,
  max,
  step,
  onChange,
  icon,
  display,
  placeholder,
}: {
  label: string
  type: 'date' | 'time'
  value: string
  min?: string
  max?: string
  step?: number
  onChange: (value: string) => void
  icon: ReactNode
  display: string | null
  placeholder: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function openPicker() {
    const el = inputRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') el.showPicker()
      else {
        el.focus()
        el.click()
      }
    } catch {
      el.focus()
    }
  }

  return (
    <label className="relative block flex-1 cursor-pointer" onClick={openPicker}>
      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className="flex min-h-[48px] items-center gap-2.5 rounded-pill border border-outline-variant/60 bg-surface-container px-4 transition-colors peer-focus-visible:border-primary"
      >
        {icon}
        {display ? (
          <span className="truncate text-[15px] font-semibold text-on-surface">{display}</span>
        ) : (
          <span className="truncate text-[15px] text-on-surface-variant">{placeholder}</span>
        )}
      </span>
      <input
        ref={inputRef}
        type={type}
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  )
}

/** Ballot builder: the proposer adds 2-5 custom times, each previewed per member. */
export function MeetupsNewView() {
  useDocumentTitle('Propose times')
  const { clusterId = '' } = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const create = useCreateMeetup(MEETUP_ENABLED && clusterId ? clusterId : null)
  const members = useClusterMembers(MEETUP_ENABLED && clusterId ? clusterId : null)

  const zones = useMemo(() => timeZoneList(), [])
  const deviceZone = useMemo(() => defaultTimeZone(), [])
  const selfMember = (members.data ?? []).find((m) => m.id === userId) ?? null
  const profileZone =
    selfMember && typeof selfMember.timezone === 'string' && isValidTimeZone(selfMember.timezone)
      ? selfMember.timezone
      : null
  const [zoneOverride, setZoneOverride] = useState('')
  const activeZone = zoneOverride || profileZone || deviceZone || 'UTC'

  const [rows, setRows] = useState<CustomRow[]>(() => [defaultRowForZone(deviceZone || 'UTC')])
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The roster (and the profile zone with it) arrives after first paint. While
  // the ballot is still pristine, re-seed the prefill in the profile zone so
  // the default reads naturally there instead of in the device zone.
  useEffect(() => {
    if (!touched && profileZone && profileZone !== (deviceZone || 'UTC')) {
      setRows([defaultRowForZone(profileZone)])
    }
  }, [touched, profileZone, deviceZone])

  const dayBounds = useMemo(() => {
    const now = Date.now()
    return {
      min: zonedDateInput(new Date(now).toISOString(), activeZone),
      max: zonedDateInput(new Date(now + 7 * 24 * 3600_000).toISOString(), activeZone),
    }
  }, [activeZone])

  const validSlots = useMemo(() => {
    const out: Array<{ starts_at: string; ends_at: string }> = []
    for (const row of rows) {
      const iso = zonedTimeToISO(row.day, row.time, activeZone)
      if (iso && isCustomSlotValid(iso)) {
        out.push({
          starts_at: iso,
          ends_at: new Date(new Date(iso).getTime() + MEETUP_SLOT_LENGTH_MS).toISOString(),
        })
      }
    }
    return out
  }, [rows, activeZone])
  const canPropose = validSlots.length >= 2 && validSlots.length <= MEETUP_MAX_SLOTS

  function setRow(index: number, patch: Partial<CustomRow>) {
    setTouched(true)
    setRows((cur) => cur.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setTouched(true)
    setRows((cur) => [...cur, { day: '', time: '' }])
  }

  function removeRow(index: number) {
    setTouched(true)
    setRows((cur) => cur.filter((_, i) => i !== index))
  }



  async function handlePropose() {
    if (!canPropose) return
    setError(null)
    try {
      const earliest = Math.min(...validSlots.map((s) => new Date(s.starts_at).getTime()))
      const closes = new Date(earliest - 3600_000).toISOString()
      await create.mutateAsync({ slots: validSlots, votingClosesAt: closes })
      navigate(`/cluster/${clusterId}/meetups`)
    } catch (err) {
      setError(rateLimitMessage(err, 'Could not propose the meetup'))
    }
  }

  if (!MEETUP_ENABLED) return null

  return (
    <section aria-label="Propose times" data-e2e="meetup-custom-screen" className="space-y-5">
      <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-container/20 text-primary">
            <CalendarPlus className="h-6 w-6" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-on-surface">Propose times</h2>
            <p className="text-sm text-on-surface-variant">Agreed on times in chat? Put them on the ballot.</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-on-surface">
          Add at least 2 times so the cluster has a choice.
        </p>
        <div className="mt-4">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
            <Globe className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            Meeting timezone
          </span>
          <div className="relative mt-1">
            <select
              aria-label="Meeting timezone"
              value={activeZone}
              onChange={(e) => {
                setTouched(true)
                setZoneOverride(e.target.value)
              }}
              className="w-full appearance-none rounded-xl border border-outline-variant/60 bg-surface-container py-2.5 pl-3 pr-10 text-sm text-on-surface outline-none transition-colors focus:border-primary"
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
              strokeWidth={1.5}
              aria-hidden
            />
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {rows.map((row, index) => {
            const iso = zonedTimeToISO(row.day, row.time, activeZone)
            const valid = iso ? isCustomSlotValid(iso) : false
            const dayParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.day)
            const dayLabel = dayParts
              ? formatPillDate(new Date(Number(dayParts[1]), Number(dayParts[2]) - 1, Number(dayParts[3]), 12), true)
              : null
            const timeDate = row.time ? new Date(`2000-01-01T${row.time}:00`) : null
            const timeLabel =
              timeDate && !Number.isNaN(timeDate.getTime())
                ? timeDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                : null
            return (
              <div
                key={index}
                data-e2e="meetup-custom-row"
                className="space-y-3 rounded-2xl border border-outline-variant/60 bg-surface-container/40 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-on-surface">Option {index + 1}</p>
                  <OptionMenu
                    index={index}
                    canRemove={rows.length > 1}
                    onRemove={() => removeRow(index)}
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <PillInput
                    label={`Option ${index + 1} day`}
                    type="date"
                    value={row.day}
                    min={dayBounds.min ?? undefined}
                    max={dayBounds.max ?? undefined}
                    onChange={(value) => setRow(index, { day: value })}
                    icon={<CalendarDays className="h-5 w-5 shrink-0 text-on-surface-variant" strokeWidth={1.5} />}
                    display={dayLabel}
                    placeholder="Pick a day"
                  />
                  <PillInput
                    label={`Option ${index + 1} time`}
                    type="time"
                    value={row.time}
                    step={900}
                    onChange={(value) => setRow(index, { time: value })}
                    icon={<Clock className="h-5 w-5 shrink-0 text-on-surface-variant" strokeWidth={1.5} />}
                    display={timeLabel}
                    placeholder="Pick a time"
                  />
                </div>
                {iso && !valid && (
                  <p className="text-xs text-error">Pick a time at least 3 hours out and within the next 7 days.</p>
                )}
                {iso && valid && (
                  <div className="border-t border-outline-variant/60 pt-3">
                    <p className="text-sm font-medium text-on-surface-variant">
                      Local times for everyone
                    </p>
                    {members.isPending ? (
                      <p className="mt-2 flex items-center gap-2 text-sm text-on-surface-variant">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading member times…
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {previewSlotMembers(members.data ?? [], iso).map((m) => {
                          return (
                            <li key={m.id} className="flex items-center gap-2.5">
                              <Avatar name={m.display_name} src={m.avatar_url} className="h-8 w-8" />
                              <span className="min-w-0 flex-1 truncate text-sm text-on-surface">
                                {m.display_name}
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                {m.id === userId ? (
                                  <span className="rounded-pill bg-primary px-2 py-0.5 text-[11px] font-semibold text-on-primary">
                                    You
                                  </span>
                                ) : (
                                  m.period && m.period !== 'day' && (
                                    <span
                                      className={
                                        m.period === 'late'
                                          ? 'flex items-center gap-1 rounded-pill border border-amber-500/40 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300'
                                          : 'flex items-center gap-1 rounded-pill border border-sky-500/40 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300'
                                      }
                                    >
                                      {m.period === 'late' ? (
                                        <Moon className="h-3 w-3" strokeWidth={2} aria-hidden />
                                      ) : (
                                        <Sun className="h-3 w-3" strokeWidth={2} aria-hidden />
                                      )}
                                      {m.period === 'late' ? 'Late there' : 'Early there'}
                                    </span>
                                  )
                                )}
                                <span className="text-xs tabular-nums text-on-surface-variant">
                                  {m.time ? `${m.day} ${m.time}` : 'No timezone set'}
                                </span>
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {rows.length < MEETUP_MAX_SLOTS && (
          <button
            type="button"
            onClick={addRow}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-surface-container"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Add another time
          </button>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
            {error}
          </p>
        )}
        <p className="mt-4 text-center text-sm">
          {validSlots.length === 0 ? (
            <>
              <span className="font-semibold text-on-surface">No times added yet.</span>{' '}
              <span className="text-on-surface-variant">Add two to propose.</span>
            </>
          ) : validSlots.length === 1 ? (
            <>
              <span className="font-semibold text-on-surface">1 time added.</span>{' '}
              <span className="text-on-surface-variant">Add one more to propose.</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-on-surface">
                {validSlots.length} times added.
              </span>{' '}
              <span className="text-on-surface-variant">Ready to propose.</span>
            </>
          )}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link
            to={`/cluster/${clusterId}/meetups`}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-pill border border-outline-variant/60 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            Back
          </Link>
          <button
            type="button"
            disabled={!canPropose || create.isPending}
            onClick={() => void handlePropose()}
            className="min-h-[48px] flex-1 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {create.isPending
              ? 'Proposing…'
              : validSlots.length === 0
                ? 'Add at least two more times'
                : validSlots.length === 1
                  ? 'Add at least one more time'
                  : `Propose ${validSlots.length} times`}
          </button>
        </div>
      </div>
    </section>
  )
}

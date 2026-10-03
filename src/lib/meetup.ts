/** Cluster Meetup beta flag and shared pure helpers. Single switch to disable the flow. */
import { formatMemberTimePadded, getDayPeriod, isValidTimeZone } from './timezones'

export const MEETUP_ENABLED = true
export const MEETUP_QUORUM = 3
/** Join opens 10 minutes before the confirmed start. */
export const MEETUP_JOIN_LEAD_MS = 10 * 60 * 1000
/** A custom slot must be at least 3h out (keeps the voting window valid) and within 7 days. */
export const MEETUP_CUSTOM_SLOT_MIN_LEAD_MS = 3 * 3600_000
export const MEETUP_CUSTOM_SLOT_MAX_AHEAD_MS = 7 * 24 * 3600_000
/** 4 suggested evening slots plus one optional custom slot. */
export const MEETUP_MAX_SLOTS = 5
/** Custom meetup calls last one hour, like the suggested slots. */
export const MEETUP_SLOT_LENGTH_MS = 3600_000

export type MeetupStatus =
  | 'proposed'
  | 'voting'
  | 'confirmed'
  | 'starting'
  | 'active'
  | 'completed'
  | 'cancelled'

export interface MeetupSlotChoice {
  id: string
  starts_at: string
  ends_at: string
  vote_count: number
}

export function formatSlot(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} at ${time}`
}

/** Confirmed-state rendering: full weekday with a middle dot, never "at". */
export function formatSlotDot(iso: string): string {
  return formatSlot(iso).replace(' at ', ' · ')
}

export function formatSlotShort(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} at ${time}`
}

/** Results-list rendering: localized 12-hour time with a middle dot, never "at". */
export function formatSlotShortDot(iso: string): string {
  return formatSlotShort(iso).replace(' at ', ' · ')
}

/** Compact 24-hour rendering for dense lists, e.g. "Sat 3 Oct · 22:49". */
export function formatSlotCompact24(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatPillDate(d, false)} · ${hh}:${mm}`
}

/** True once any slot has reached quorum. */
export function hasQuorum(slots: Pick<MeetupSlotChoice, 'vote_count'>[]): boolean {
  return slots.some((s) => s.vote_count >= MEETUP_QUORUM)
}

/** Deterministic winner: most votes, then earliest start, then id. */
export function winningSlot<T extends MeetupSlotChoice>(slots: T[]): T | null {
  let best: T | null = null
  for (const s of slots) {
    if (!best) {
      best = s
      continue
    }
    if (s.vote_count !== best.vote_count) {
      if (s.vote_count > best.vote_count) best = s
      continue
    }
    if (s.starts_at !== best.starts_at) {
      if (s.starts_at < best.starts_at) best = s
      continue
    }
    if (s.id < best.id) best = s
  }
  return best && best.vote_count >= MEETUP_QUORUM ? best : null
}

/** True once a start time has passed. Null or invalid never started. */
export function hasStarted(startsAt: string | null | undefined, now = Date.now()): boolean {
  if (!startsAt) return false
  const start = new Date(startsAt).getTime()
  return !Number.isNaN(start) && now >= start
}

/** Join is enabled from 10 minutes before start until 2 hours after. */
export function canJoinMeetup(startsAt: string | null, now = Date.now()): boolean {
  if (!startsAt) return false
  const start = new Date(startsAt).getTime()
  if (Number.isNaN(start)) return false
  return now >= start - MEETUP_JOIN_LEAD_MS && now <= start + 2 * 3600_000
}

/**
 * Prefill for the first ballot row: next Saturday 7pm local. Late on a
 * Saturday the 7pm sits in a dead zone (too soon today, past the 7-day cap
 * next week), so fall back to the nearest following 7pm. The prefill is
 * always submittable as-is.
 */
export function defaultCustomStart(now = new Date()): Date {
  const d = new Date(now)
  const delta = (6 - d.getDay() + 7) % 7
  const candidate = new Date(d)
  candidate.setDate(d.getDate() + delta)
  candidate.setHours(19, 0, 0, 0)
  if (isCustomSlotValid(candidate.toISOString(), now.getTime())) return candidate
  const fallback = new Date(now)
  fallback.setHours(19, 0, 0, 0)
  if (fallback.getTime() <= now.getTime() + MEETUP_CUSTOM_SLOT_MIN_LEAD_MS) {
    fallback.setDate(fallback.getDate() + 1)
  }
  return fallback
}

/** Combine a yyyy-mm-dd day and hh:mm time into an ISO instant, or null. */
export function customRowToISO(day: string, time: string): string | null {
  if (!day || !time) return null
  const at = new Date(`${day}T${time}:00`)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/** A custom slot must be at least 3h out and within 7 days. */
export function isCustomSlotValid(startsAt: string, now = Date.now()): boolean {
  const start = new Date(startsAt).getTime()
  if (Number.isNaN(start)) return false
  return (
    start >= now + MEETUP_CUSTOM_SLOT_MIN_LEAD_MS &&
    start <= now + MEETUP_CUSTOM_SLOT_MAX_AHEAD_MS
  )
}

/** Midnight-based day starts for the coming week (custom-slot day picker). */
export function nextSevenMidnights(now = new Date()): Date[] {
  const base = new Date(now)
  base.setHours(0, 0, 0, 0)
  const days: Date[] = []
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    days.push(d)
  }
  return days
}

/** Count-prefixed pluralization, e.g. pluralize(1, 'member', 'members') -> '1 member'. */
export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Compact pill date for the propose-times controls, e.g. "Sat 3 Oct" or with
 * year "Sat 3 Oct 2026". Words follow the device locale; order is fixed to
 * match the design. Pass a zone to render the instant in that zone instead
 * of the device zone. Time pills use a plain locale time string instead.
 */
export function formatPillDate(d: Date, withYear: boolean, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const base = `${get('weekday')} ${get('day')} ${get('month')}`
  return withYear ? `${base} ${get('year')}` : base
}

/**
 * One member's local rendering of a slot instant, or null without a valid
 * timezone. The time is zero-padded ("07:10 AM") so columns of times align.
 */
export function formatSlotForMember(
  iso: string,
  timeZone: string | null | undefined,
): { time: string; period: 'day' | 'late' | 'early' | null } | null {
  if (!timeZone || !isValidTimeZone(timeZone)) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return { time: formatMemberTimePadded(at, timeZone), period: getDayPeriod(at, timeZone) }
}

/** Short weekday of a slot instant in a member zone, e.g. "Sat". Null without a valid zone. */
export function formatSlotDay(iso: string, timeZone: string | null | undefined): string | null {
  if (!timeZone || !isValidTimeZone(timeZone)) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return (
    new Intl.DateTimeFormat(undefined, { timeZone, weekday: 'short' }).formatToParts(at).find((p) => p.type === 'weekday')
      ?.value ?? null
  )
}

export interface SlotMember {
  id: string
  display_name: string | null
  avatar_url: string | null | undefined
  timezone: string | null | undefined
}

export interface SlotMemberPreview extends SlotMember {
  time: string | null
  day: string | null
  period: 'day' | 'late' | 'early' | null
}

/**
 * Per-member local preview of one slot instant, sorted by local time earliest
 * first so same-zone members group together. For a single instant this equals
 * the timezone-offset order, including across midnight. Members without a
 * usable timezone sort last by name.
 */
export function previewSlotMembers<T extends SlotMember>(members: T[], iso: string): Array<T & SlotMemberPreview> {
  const at = new Date(iso)
  const valid = !Number.isNaN(at.getTime())
  const enriched = members.map((m) => {
    const zone = typeof m.timezone === 'string' && isValidTimeZone(m.timezone) ? m.timezone : null
    const rendered = valid && zone ? formatSlotForMember(iso, zone) : null
    return {
      ...m,
      time: rendered?.time ?? null,
      day: rendered && zone ? formatSlotDay(iso, zone) : null,
      period: rendered?.period ?? null,
      sortKey: valid && zone ? slotCivilKey(at, zone) : null,
    }
  })
  enriched.sort((a, b) => {
    if (a.sortKey === null && b.sortKey === null) return (a.display_name ?? '').localeCompare(b.display_name ?? '')
    if (a.sortKey === null) return 1
    if (b.sortKey === null) return -1
    if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1
    return (a.display_name ?? '').localeCompare(b.display_name ?? '')
  })
  // Stripping the internal sort key is sound: the rest keeps every member prop.
  return enriched.map(({ sortKey: _sortKey, ...rest }) => rest) as Array<T & SlotMemberPreview>
}

/** Zero-padded civil datetime of an instant in a zone; comparable as a string. */
function slotCivilKey(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export type MuteDurationKey = 'hour' | 'eight_hours' | 'day' | 'indefinite'

export const MUTE_DURATIONS: { key: MuteDurationKey; label: string; ms: number | null }[] = [
  { key: 'hour', label: '1 hour', ms: 3_600_000 },
  { key: 'eight_hours', label: '8 hours', ms: 8 * 3_600_000 },
  { key: 'day', label: '1 day', ms: 24 * 3_600_000 },
  { key: 'indefinite', label: 'Until I turn it back on', ms: null },
]

const INDEFINITE_MUTED_UNTIL = 'infinity'

/**
 * Push-only cluster mute state from notification_prefs.push_muted_until.
 * Null means unmuted; a future timestamp (or 'infinity') means muted. The
 * per-type Settings toggles are untouched by card mutes and ignored here.
 */
export function isClusterPushMuted(
  mutedUntil: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!mutedUntil) return false
  if (mutedUntil === INDEFINITE_MUTED_UNTIL) return true
  const expiry = Date.parse(mutedUntil)
  if (Number.isNaN(expiry)) return false
  return expiry > nowMs
}

/** Expiry value to store for a duration choice ('infinity' stays muted). */
export function mutedUntilForDuration(key: MuteDurationKey, nowMs = Date.now()): string {
  const duration = MUTE_DURATIONS.find((d) => d.key === key)
  if (!duration) throw new Error(`Unknown mute duration: ${key}`)
  if (duration.ms === null) return INDEFINITE_MUTED_UNTIL
  return new Date(nowMs + duration.ms).toISOString()
}

/**
 * Human expiry fragment for the muted sheet subtitle, e.g.
 * "today at 6:32 PM" or "tomorrow at 6:32 PM". Timed mutes last at most a
 * day, so anything beyond tomorrow falls back to a short date. Null for
 * indefinite and unparsable values.
 */
export function formatMuteExpiry(mutedUntil: string, nowMs = Date.now()): string | null {
  if (mutedUntil === INDEFINITE_MUTED_UNTIL) return null
  const expiry = Date.parse(mutedUntil)
  if (Number.isNaN(expiry)) return null
  const time = formatMuteTime(expiry)
  const now = new Date(nowMs)
  now.setHours(0, 0, 0, 0)
  const day = new Date(expiry)
  day.setHours(0, 0, 0, 0)
  const dayDiff = Math.round((day.getTime() - now.getTime()) / 86_400_000)
  if (dayDiff <= 0) return `today at ${time}`
  if (dayDiff === 1) return `tomorrow at ${time}`
  const date = new Date(expiry).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${date} at ${time}`
}

function formatMuteTime(expiryMs: number): string {
  const date = new Date(expiryMs)
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const hour24 = date.getHours()
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${minutes} ${suffix}`
}

/**
 * Full muted-state subtitle, e.g. "Aurora is muted until tomorrow at
 * 6:32 PM." Null when unmuted or the value is unusable.
 */
export function mutedUntilCopy(
  clusterName: string,
  mutedUntil: string | null | undefined,
  nowMs = Date.now(),
): string | null {
  if (!isClusterPushMuted(mutedUntil, nowMs)) return null
  if (mutedUntil === INDEFINITE_MUTED_UNTIL) {
    return `${clusterName} is muted until you turn notifications back on.`
  }
  const when = mutedUntil ? formatMuteExpiry(mutedUntil, nowMs) : null
  if (!when) return `${clusterName} notifications are muted.`
  return `${clusterName} is muted until ${when}.`
}

/**
 * Which duration choice an expiry corresponds to, for the sheet checkmark.
 * The server stores only the timestamp, so a timed choice is recognized when
 * the remaining time is within a minute of a preset (i.e. just picked).
 * Older mutes and ambiguous remainders return null instead of a wrong check.
 */
export function activeDurationKey(
  mutedUntil: string | null | undefined,
  nowMs = Date.now(),
): MuteDurationKey | null {
  if (!mutedUntil) return null
  if (mutedUntil === INDEFINITE_MUTED_UNTIL) return 'indefinite'
  const expiry = Date.parse(mutedUntil)
  if (Number.isNaN(expiry) || expiry <= nowMs) return null
  const remaining = expiry - nowMs
  for (const duration of MUTE_DURATIONS) {
    if (duration.ms !== null && Math.abs(remaining - duration.ms) < 60_000) {
      return duration.key
    }
  }
  return null
}

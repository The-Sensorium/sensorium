export const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const postDatePart = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const postTimePart = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })

/** Post card header timestamp as `29 Sept · 10:46 PM`. */
export function formatPostTimestamp(value: Date | string | number): string {
  const d = new Date(value)
  return `${postDatePart.format(d)} · ${postTimePart.format(d)}`
}

/** Call time as `m:ss`, or `h:mm:ss` past an hour. Non-positive/invalid -> `0:00`. */
export function formatCallDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const ss = String(seconds).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
    : `${minutes}:${ss}`
}

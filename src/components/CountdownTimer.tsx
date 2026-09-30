import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'

/** Ticking countdown from an ISO deadline string. */
export function CountdownTimer({ deadline, className }: { deadline: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const diff = new Date(deadline).getTime() - now
  const expired = diff <= 0
  // Ceil total minutes first so leftover seconds roll into the next
  // minute, hour, or day instead of ever rendering a "60m" segment.
  const totalMinutes = Math.ceil(diff / 60_000)
  const d = Math.floor(totalMinutes / 1440)
  const h = Math.floor((totalMinutes % 1440) / 60)
  const m = totalMinutes % 60

  let label: string
  if (d > 0) label = `${d}d ${h}h ${m}m`
  else if (h > 0) label = `${h}h ${m}m`
  else label = `${m}m`

  return (
    <span
      className={cn('tabular-nums', expired ? 'text-error' : undefined, className)}
    >
      {expired ? 'Expired' : label}
    </span>
  )
}

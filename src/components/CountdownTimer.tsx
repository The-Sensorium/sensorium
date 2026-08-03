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
  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff % 86_400_000) / 3_600_000)
  const m = Math.ceil((diff % 3_600_000) / 60_000)

  let label: string
  if (d > 0) label = `${d}d ${h}h ${m}m`
  else if (h > 0) label = `${h}h ${m}m`
  else label = `${m}m`

  return (
    <span
      className={cn('tabular-nums', (expired || m === 0) ? 'text-error' : undefined, className)}
    >
      {expired ? 'Expired' : label}
    </span>
  )
}

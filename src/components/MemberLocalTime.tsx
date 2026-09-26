import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { formatMemberTime, isValidTimeZone } from '../lib/timezones'

function msToNextMinute(now: Date): number {
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds())
}

export function MemberLocalTime({ timeZone }: { timeZone: string | null | undefined }) {
  const [, setTick] = useState(0)
  const valid = !!timeZone && isValidTimeZone(timeZone)

  useEffect(() => {
    if (!valid) return
    let timer: ReturnType<typeof setTimeout>
    function schedule() {
      timer = setTimeout(() => {
        setTick((t) => t + 1)
        schedule()
      }, msToNextMinute(new Date()))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [valid, timeZone])

  if (!valid) return null
  return (
    <span className="inline-flex items-center gap-1">
      <Clock className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden />
      {formatMemberTime(new Date(), timeZone as string)}
    </span>
  )
}

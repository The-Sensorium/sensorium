import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { formatMemberTime, isMemberDaytime, isValidTimeZone } from '../lib/timezones'

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
  const now = new Date()
  const isDay = isMemberDaytime(now, timeZone as string)
  const Icon = isDay === false ? Moon : Sun
  return (
    <span className="inline-flex items-center gap-1">
      <Icon
        className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400"
        strokeWidth={1.5}
        fill="currentColor"
        aria-hidden
      />
      {formatMemberTime(now, timeZone as string)}
    </span>
  )
}

import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { Moon, Sun } from 'lucide-react-native'
import { formatMemberTime, isMemberDaytime, isValidTimeZone } from '../lib/timezones'
import { useResolvedScheme } from '../lib/theme-choice'
import { useTheme } from '../lib/use-theme'

function msToNextMinute(now: Date): number {
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds())
}

export function MemberLocalTime({
  timeZone,
  fontSize = 12,
}: {
  timeZone: string | null | undefined
  fontSize?: number
}) {
  const t = useTheme()
  const scheme = useResolvedScheme()
  const amber = scheme === 'dark' ? '#fbbf24' : '#f59e0b'
  const [, setTick] = useState(0)
  const valid = !!timeZone && isValidTimeZone(timeZone)

  useEffect(() => {
    if (!valid) return
    let timer: ReturnType<typeof setTimeout>
    function schedule() {
      timer = setTimeout(() => {
        setTick((n) => n + 1)
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon size={fontSize + 2} color={amber} fill={amber} strokeWidth={1.5} />
      <Text style={{ fontSize, color: t.onSurfaceVariant }}>
        {formatMemberTime(now, timeZone as string)}
      </Text>
    </View>
  )
}

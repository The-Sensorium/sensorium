import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { Clock } from 'lucide-react-native'
import { formatMemberTime, isValidTimeZone } from '../lib/timezones'
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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Clock size={fontSize} color={t.onSurfaceVariant} strokeWidth={1.5} />
      <Text style={{ fontSize, color: t.onSurfaceVariant }}>
        {formatMemberTime(new Date(), timeZone as string)}
      </Text>
    </View>
  )
}

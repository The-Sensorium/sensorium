import { useEffect, useState } from 'react'
import { Text } from 'react-native'
import { useTheme } from '../lib/use-theme'

function labelFor(deadline: string, now: number): { text: string; expired: boolean } {
  const diff = new Date(deadline).getTime() - now
  if (diff <= 0) return { text: 'Expired', expired: true }
  // Ceil total minutes first so leftover seconds roll into the next
  // minute, hour, or day instead of ever rendering a "60m" segment.
  const totalMinutes = Math.ceil(diff / 60_000)
  const d = Math.floor(totalMinutes / 1440)
  const h = Math.floor((totalMinutes % 1440) / 60)
  const m = totalMinutes % 60
  if (d > 0) return { text: `${d}d ${h}h ${m}m`, expired: false }
  if (h > 0) return { text: `${h}h ${m}m`, expired: false }
  return { text: `${m}m`, expired: false }
}

export function CountdownTimer({ deadline }: { deadline: string }) {
  const t = useTheme()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const { text, expired } = labelFor(deadline, now)
  return (
    <Text style={{ fontWeight: '600', color: expired ? t.error : undefined }}>{text}</Text>
  )
}

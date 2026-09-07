import { Text } from 'react-native'
import { useTheme } from '../../lib/use-theme'

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

export function DayDivider({ iso }: { iso: string }) {
  const t = useTheme()
  return (
    <Text
      style={{
        marginVertical: 12,
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: t.onSurfaceVariant,
      }}
    >
      {dayFormatter.format(new Date(iso))}
    </Text>
  )
}

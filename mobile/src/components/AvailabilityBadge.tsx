import { Text, View } from 'react-native'
import { availabilityMeta, type Availability } from '../lib/availability'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

const DOT_COLORS: Record<string, string> = {
  'bg-emerald-500': '#10b981',
  'bg-amber-500': '#f59e0b',
  'bg-red-500': '#ef4444',
}

export function AvailabilityBadge({ value }: { value: Availability }) {
  const t = useTheme()
  const meta = availabilityMeta(value)
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: t.surfaceContainer,
        borderRadius: radii.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: DOT_COLORS[meta.dotClass] ?? t.onSurfaceVariant,
        }}
      />
      <Text style={{ fontSize: 12, fontWeight: '500', color: t.onSurfaceVariant }}>
        {meta.label}
      </Text>
    </View>
  )
}

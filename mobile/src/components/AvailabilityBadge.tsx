import { Text, View } from 'react-native'
import { availabilityMeta, type Availability } from '../lib/availability'
import { radii } from '../lib/theme-tokens'
import { useResolvedScheme } from '../lib/theme-choice'
import { useTheme } from '../lib/use-theme'

const DOT_COLORS: Partial<Record<Availability, { light: string; dark: string }>> = {
  available: { light: '#10b981', dark: '#34d399' },
  busy: { light: '#f59e0b', dark: '#fbbf24' },
  dnd: { light: '#ef4444', dark: '#f87171' },
}

export function AvailabilityBadge({ value }: { value: Availability }) {
  const t = useTheme()
  const scheme = useResolvedScheme()
  const meta = availabilityMeta(value)
  const palette = DOT_COLORS[value]
  const dotColor =
    palette !== undefined
      ? scheme === 'dark'
        ? palette.dark
        : palette.light
      : t.onSurfaceVariant
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
          backgroundColor: dotColor,
        }}
      />
      <Text style={{ fontSize: 12, fontWeight: '500', color: t.onSurfaceVariant }}>
        {meta.label}
      </Text>
    </View>
  )
}

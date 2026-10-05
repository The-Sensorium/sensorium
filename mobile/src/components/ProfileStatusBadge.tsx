import { Text, View } from 'react-native'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { profileStatusMeta, type DisplayStatus } from '../lib/profile-status'

export function ProfileStatusBadge({ value }: { value: DisplayStatus }) {
  const t = useTheme()
  const meta =
    value === 'offline'
      ? { label: 'Offline', dotHex: t.onSurfaceVariant }
      : profileStatusMeta(value)
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Status ${meta.label}`}
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
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.dotHex }} />
      <Text style={{ fontSize: 12, fontWeight: '500', color: t.onSurfaceVariant }}>
        {meta.label}
      </Text>
    </View>
  )
}

import { Pressable, Text, View } from 'react-native'
import { EyeOff } from 'lucide-react-native'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

export function MutedPlaceholder({ name, onToggle }: { name: string; onToggle: () => void }) {
  const t = useTheme()
  return (
    <View
      style={{
        backgroundColor: t.surfaceContainer,
        borderRadius: radii.md,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginVertical: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <EyeOff size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
      <Text style={{ flex: 1, fontSize: 13, color: t.onSurfaceVariant }}>
        Muted {name}’s message
      </Text>
      <Pressable onPress={onToggle}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: t.primary }}>Show</Text>
      </Pressable>
    </View>
  )
}

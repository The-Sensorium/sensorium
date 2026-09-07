import { Text, View } from 'react-native'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

export function PronounBadge({ pronouns }: { pronouns: string }) {
  const t = useTheme()
  return (
    <View
      style={{
        backgroundColor: t.surfaceContainer,
        borderRadius: radii.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '500', color: t.onSurfaceVariant }}>{pronouns}</Text>
    </View>
  )
}

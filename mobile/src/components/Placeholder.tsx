import { View, Text } from 'react-native'
import { colors } from '../../src/lib/theme-tokens'

export default function Placeholder({ title }: { title: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <Text style={{ color: colors.onSurface }}>{title} — coming in its phase (see docs/archive/MOBILE_APP_PLAN.md)</Text>
    </View>
  )
}

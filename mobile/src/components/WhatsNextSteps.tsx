import { Text, View, type ViewStyle } from 'react-native'
import { Bell, Clock, MessageSquare } from 'lucide-react-native'
import { CLUSTER_SIZE } from '../lib/constants'
import { useTheme } from '../lib/use-theme'

export function WhatsNextSteps({
  compact = false,
  style,
}: {
  compact?: boolean
  style?: ViewStyle
}) {
  const t = useTheme()
  const bodySize = compact ? 12 : 14
  const bodyLine = compact ? 20 : 22
  const iconSize = compact ? 14 : 16

  return (
    <View
      accessibilityLabel="What happens next"
      testID="whats-next-steps"
      style={[{ marginTop: compact ? 12 : 24 }, style]}
    >
      <Text style={{ fontSize: compact ? 12 : 14, fontWeight: '600', color: t.onSurface }}>
        What happens next
      </Text>
      <View style={{ marginTop: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Bell size={iconSize} color={t.primary} strokeWidth={1.5} />
          <Text style={{ flex: 1, fontSize: bodySize, lineHeight: bodyLine, color: t.onSurfaceVariant }}>
            We&rsquo;ll notify you once {CLUSTER_SIZE} are in and your cluster forms.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Clock size={iconSize} color={t.primary} strokeWidth={1.5} />
          <Text style={{ flex: 1, fontSize: bodySize, lineHeight: bodyLine, color: t.onSurfaceVariant }}>
            Once your cluster forms, you have 72 hours to complete intros or you&rsquo;ll lose your spot.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <MessageSquare size={iconSize} color={t.primary} strokeWidth={1.5} />
          <Text style={{ flex: 1, fontSize: bodySize, lineHeight: bodyLine, color: t.onSurfaceVariant }}>
            Chat unlocks once everyone answers.
          </Text>
        </View>
      </View>
    </View>
  )
}

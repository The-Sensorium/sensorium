import { Text, View } from 'react-native'
import { useConnectionState, useParticipants } from '@livekit/react-native'
import { ConnectionState } from 'livekit-client'
import { Clock } from 'lucide-react-native'
import { formatCallDuration } from '../format'
import { radii } from '../../../lib/theme-tokens'
import { useTheme } from '../../../lib/use-theme'

interface CallHeaderProps {
  elapsed: number
  remaining: number
  warning: boolean
}

/** Title, live participant count, reconnect state, and the call countdown badge. */
export function CallHeader({ elapsed, remaining, warning }: CallHeaderProps) {
  const t = useTheme()
  const participants = useParticipants()
  const connection = useConnectionState()
  const reconnecting = connection !== ConnectionState.Connected

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: t.onSurface }}>Cluster call</Text>
        <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
          {reconnecting
            ? connection === ConnectionState.Reconnecting
              ? 'Reconnecting…'
              : 'Connecting…'
            : `${participants.length} in the call`}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: warning ? t.errorContainer : t.surfaceContainer,
          borderRadius: radii.pill,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}
      >
        <Clock size={12} color={warning ? t.error : t.onSurfaceVariant} strokeWidth={1.5} />
        <Text
          style={{ fontSize: 12, fontWeight: '600', color: warning ? t.error : t.onSurfaceVariant }}
        >
          {warning ? `${formatCallDuration(remaining)} left` : formatCallDuration(elapsed)}
        </Text>
      </View>
    </View>
  )
}

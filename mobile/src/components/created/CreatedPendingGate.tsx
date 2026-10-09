import { Text, View } from 'react-native'
import { Link } from 'expo-router'
import { Clock } from 'lucide-react-native'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { useClusterOnAccent } from '../../lib/cluster-theme'

/** Locked view for pending created clusters: chat, signals, votes, calls,
 * and settings stay closed until 3 members activate the cluster. */
export function CreatedPendingGate({
  clusterId,
  confirmedCount,
  loading,
}: {
  clusterId: string
  confirmedCount: number
  loading?: boolean
}) {
  const t = useTheme()
  const onAccent = useClusterOnAccent() ?? t.onPrimary
  const remaining = Math.max(0, 3 - confirmedCount)
  return (
    <View style={{ alignItems: 'center', padding: 32 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: t.surfaceContainer,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Clock size={24} color={t.onSurfaceVariant} strokeWidth={1.5} />
      </View>
      <Text style={{ marginTop: 16, fontSize: 20, fontWeight: '600', color: t.onSurface }}>
        Waiting for members
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, textAlign: 'center', color: t.onSurfaceVariant }}>
        {loading
          ? 'This cluster activates once 3 members have joined. Chat, signals, votes, and calls unlock then.'
          : `This cluster activates once ${remaining} more ${remaining === 1 ? 'member joins' : 'members join'}. Chat, signals, votes, and calls unlock then.`}
      </Text>
      <Link
        href={{ pathname: '/cluster/[clusterId]/members', params: { clusterId } }}
        style={{
          marginTop: 20,
          backgroundColor: t.primary,
          borderRadius: radii.pill,
          paddingHorizontal: 24,
          paddingVertical: 14,
          minHeight: 48,
          color: onAccent,
          fontSize: 14,
          fontWeight: '600',
          overflow: 'hidden',
        }}
      >
        View members
      </Link>
    </View>
  )
}

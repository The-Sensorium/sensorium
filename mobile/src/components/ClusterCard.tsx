import { Pressable, Text, View } from 'react-native'
import { Link, type Href } from 'expo-router'
import { Users } from 'lucide-react-native'
import type { MyCluster } from '../features/matching'
import { modeInfo } from '../lib/modes'
import { radii, shadowShape } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

function statusLabel(status: string, introComplete: boolean): string {
  if (status === 'archived') return 'Archived'
  if (status === 'active') return 'Active'
  if (introComplete) return 'Introductions complete'
  return 'Introductions in progress'
}

export function ClusterCard({ item }: { item: MyCluster }) {
  const t = useTheme()
  const { cluster } = item
  const introComplete = cluster.introductions_completed_at !== null
  const info = modeInfo(cluster.matching_mode)
  const Icon = info.icon
  const target: Href =
    cluster.status === 'introductions' && !introComplete
      ? { pathname: '/cluster/[clusterId]/introductions', params: { clusterId: cluster.id } }
      : { pathname: '/cluster/[clusterId]/room', params: { clusterId: cluster.id } }

  return (
    <Link href={target} asChild>
      <Pressable
        style={{
          backgroundColor: t.surfaceContainer,
          borderRadius: radii.xl,
          padding: 20,
          marginBottom: 16,
          ...shadowShape,
          shadowColor: t.shadowColor,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon size={14} color={t.primary} strokeWidth={1.5} />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: t.primary,
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {info.label}
              </Text>
            </View>
            <Text
              style={{ marginTop: 4, fontSize: 18, fontWeight: '600', color: t.onSurface }}
              numberOfLines={1}
            >
              {cluster.name}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: t.surfaceLowest,
              borderRadius: radii.pill,
              paddingHorizontal: 12,
              paddingVertical: 6,
              alignSelf: 'flex-start',
            }}
          >
            <Users size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>
              {item.memberCount} members
            </Text>
          </View>
        </View>
        <Text style={{ marginTop: 12, fontSize: 14, color: t.onSurfaceVariant }}>
          {statusLabel(cluster.status, introComplete)}
        </Text>
      </Pressable>
    </Link>
  )
}

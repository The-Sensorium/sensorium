import { Pressable, Text, View } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { isMatchingMode, modeInfo } from '../../../src/lib/modes'
import { useClustersByMode } from '../../../src/features/discovery'
import { useMyClusters } from '../../../src/features/matching'
import { useTheme } from '../../../src/lib/use-theme'
import { LoadingView, Screen } from '../../../src/components/ui'
import { ModePanel } from '../../../src/components/discovery/ModePanel'
import { PublicClusterCard } from '../../../src/components/PublicClusterCard'

export default function DiscoveryModeScreen() {
  const t = useTheme()
  const { modeId } = useLocalSearchParams<{ modeId: string }>()
  const raw = modeId ?? ''
  const mode = isMatchingMode(raw) ? raw : null
  const info = mode ? modeInfo(mode) : null

  const clusters = useClustersByMode(mode)
  const mine = useMyClusters()
  const myClusterIds = new Set((mine.data ?? []).map((m) => m.cluster.id))

  if (!mode || !info) {
    return (
      <Screen>
        <Text style={{ fontSize: 28, fontWeight: '600', color: t.onSurface }}>Clusters</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: t.onSurfaceVariant }}>
          That matching mode doesn’t exist.
        </Text>
        <Link href="/(app)/clusters" asChild>
          <Pressable style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={16} color={t.primary} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
              Back to clusters
            </Text>
          </Pressable>
        </Link>
      </Screen>
    )
  }

  return (
    <Screen>
      <Link href="/(app)/clusters" asChild>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={16} color={t.onSurfaceVariant} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
            Clusters
          </Text>
        </Pressable>
      </Link>
      <Text style={{ marginTop: 8, fontSize: 28, fontWeight: '600', color: t.onSurface }}>
        {info.label}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant, marginBottom: 16 }}>
        {info.detail}
      </Text>

      <ModePanel mode={mode} />

      <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface, marginTop: 24, marginBottom: 12 }}>
        Clusters
      </Text>
      {clusters.isLoading ? (
        <LoadingView />
      ) : (clusters.data ?? []).length === 0 ? (
        <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
          No clusters in this mode yet.
        </Text>
      ) : (
        <View>
          {(clusters.data ?? []).map((c) => (
            <PublicClusterCard key={c.id} cluster={c} isMember={myClusterIds.has(c.id)} />
          ))}
        </View>
      )}
    </Screen>
  )
}

import { Pressable, Text, View } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react-native'
import { isMatchingMode, modeInfo } from '../../../src/lib/modes'
import { useClustersByMode } from '../../../src/features/discovery'
import { useMyClusters } from '../../../src/features/matching'
import { useTheme } from '../../../src/lib/use-theme'
import { ErrorText, LoadingView, Screen } from '../../../src/components/ui'
import { usePullToRefresh } from '../../../src/lib/use-pull-to-refresh'
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
  const queryClient = useQueryClient()
  const pull = usePullToRefresh([
    () => clusters.refetch(),
    () => mine.refetch(),
    () => queryClient.refetchQueries({ queryKey: ['my-queues'] }),
    () => queryClient.refetchQueries({ queryKey: ['matching-status'] }),
    () => queryClient.refetchQueries({ queryKey: ['queue-count'] }),
  ])

  if (!mode || !info) {
    return (
      <Screen>
        <Text style={{ fontSize: 28, fontWeight: '600', color: t.onSurface }}>Clusters</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: t.onSurfaceVariant }}>
          That matching mode doesn’t exist.
        </Text>
        <Link href="/(app)/clusters" asChild>
          <Pressable hitSlop={8} style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, minHeight: 48 }}>
            <ArrowLeft size={16} color={t.primary} />
            <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.primary }}>
              Back to clusters
            </Text>
          </Pressable>
        </Link>
      </Screen>
    )
  }

  return (
    <Screen onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      <ErrorText message={pull.error} />
      <Link href="/(app)/clusters" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to clusters"
          hitSlop={12}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 6,
            paddingVertical: 12,
            minHeight: 48,
            paddingRight: 16,
            marginBottom: 8,
          }}
        >
          <ArrowLeft size={18} color={t.primary} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: t.primary }}>
            Clusters
          </Text>
        </Pressable>
      </Link>
      <Text style={{ marginTop: 4, fontSize: 28, lineHeight: 34, letterSpacing: -0.2, fontWeight: '600', color: t.onSurface }} accessibilityRole="header">
        {info.label}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, marginBottom: 16 }}>
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

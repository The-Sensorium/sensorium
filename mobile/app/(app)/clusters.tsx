import { Pressable, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { ArrowRight, Users } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { CLUSTER_SIZE } from '../../src/lib/constants'
import { MATCHING_MODES } from '../../src/lib/modes'
import { usePublicClusterCounts } from '../../src/features/discovery'
import { useMyQueueStatus, useMyClusters } from '../../src/features/matching'
import { radii } from '../../src/lib/theme-tokens'
import { useTheme } from '../../src/lib/use-theme'
import { Card, ErrorText, LoadingView, Screen } from '../../src/components/ui'
import { usePullToRefresh } from '../../src/lib/use-pull-to-refresh'
import { ClusterCard } from '../../src/components/ClusterCard'

export default function ClustersScreen() {
  const t = useTheme()
  const clusters = useMyClusters()
  const counts = usePublicClusterCounts()
  const status = useMyQueueStatus()
  const countByMode = new Map((counts.data ?? []).map((r) => [r.mode, r.cluster_count]))
  const pull = usePullToRefresh([
    () => clusters.refetch(),
    () => counts.refetch(),
    () => status.refetch(),
  ])

  return (
    <Screen onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      <Text style={{ fontSize: 28, fontWeight: '600', color: t.onSurface }}>Clusters</Text>
      <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant, marginBottom: 24 }}>
        Every cluster you’ve been matched into. Browse a matching mode below to meet more people.
      </Text>
      <ErrorText message={pull.error} />

      <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface, marginBottom: 12 }}>
        Your clusters
      </Text>
      {clusters.isLoading ? (
        <LoadingView />
      ) : (clusters.data ?? []).length === 0 ? (
        <Card plain>
          <View style={{ alignItems: 'center', padding: 16 }}>
            <Users size={24} color={t.onSurfaceVariant} strokeWidth={1.5} />
            <Text style={{ marginTop: 12, fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
              No clusters yet. Join a matching mode below and you’ll be matched with{' '}
              {CLUSTER_SIZE - 1} strangers.
            </Text>
          </View>
        </Card>
      ) : (
        (clusters.data ?? []).map((item) => <ClusterCard key={item.cluster.id} item={item} />)
      )}

      <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface, marginTop: 24, marginBottom: 12 }}>
        Find a match
      </Text>
      {MATCHING_MODES.map((mode) => (
        <ModeTile
          key={mode.value}
          value={mode.value}
          label={mode.label}
          detail={mode.detail}
          icon={mode.icon}
          count={counts.isLoading ? undefined : (countByMode.get(mode.value) ?? 0)}
          status={status.data?.find((r) => r.mode === mode.value)}
        />
      ))}
    </Screen>
  )
}

function ModeTile({
  value,
  label,
  detail,
  icon: Icon,
  count,
  status,
}: {
  value: string
  label: string
  detail: string
  icon: LucideIcon
  count: number | undefined
  status: { cluster_id: string | null; joined: boolean; waiting: number } | undefined
}) {
  const t = useTheme()
  const stateLine = status
    ? status.cluster_id
      ? "You're in a cluster"
      : status.joined
        ? `${status.waiting} of ${CLUSTER_SIZE} waiting`
        : 'No queue yet'
    : 'No queue yet'

  return (
    <Link href={{ pathname: '/mode/[modeId]', params: { modeId: value } }} asChild>
      <Pressable
        style={{ backgroundColor: t.surfaceContainer, borderRadius: radii.xl, padding: 20, marginBottom: 16 }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <Icon size={20} color={t.primary} strokeWidth={1.5} />
            <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
              {label}
            </Text>
          </View>
          <View
            style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>
              {count === undefined ? '…' : `${count} ${count === 1 ? 'cluster' : 'clusters'}`}
            </Text>
          </View>
        </View>
        <Text style={{ marginTop: 8, fontSize: 14, color: t.onSurfaceVariant }}>{detail}</Text>
        <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>{stateLine}</Text>
          <ArrowRight size={16} color={t.onSurfaceVariant} />
        </View>
      </Pressable>
    </Link>
  )
}

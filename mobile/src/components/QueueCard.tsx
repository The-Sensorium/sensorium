import { Pressable, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { CLUSTER_SIZE } from '../lib/constants'
import { useQueueCount, type MyQueueEntry } from '../features/matching'
import { modeInfo } from '../lib/modes'
import { radii, shadowShape } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

export function QueueProgress({ mode, queueKey }: { mode: MyQueueEntry['mode']; queueKey: string | null }) {
  const t = useTheme()
  const { count, isLoading } = useQueueCount(mode, queueKey)
  const current = count ?? 0
  const pct = Math.min(100, Math.round((current / CLUSTER_SIZE) * 100))

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
          {isLoading && count === null ? 'Checking…' : `${current} of ${CLUSTER_SIZE} in queue`}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>{pct}%</Text>
      </View>
      <View
        style={{
          marginTop: 6,
          height: 8,
          borderRadius: 4,
          backgroundColor: t.surfaceContainer,
        }}
      >
        <View
          style={{
            height: '100%',
            borderRadius: 4,
            backgroundColor: t.primary,
            width: `${pct}%`,
          }}
        />
      </View>
    </View>
  )
}

export function QueueCard({ entry }: { entry: MyQueueEntry }) {
  const t = useTheme()
  const info = modeInfo(entry.mode)
  const Icon = info.icon

  return (
    <Link href={{ pathname: '/queue/[queueId]', params: { queueId: entry.mode } }} asChild>
      <Pressable
        style={{
          backgroundColor: t.surfaceLowest,
          borderRadius: radii.xl,
          padding: 20,
          marginBottom: 16,
          ...shadowShape,
          shadowColor: t.shadowColor,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon size={14} color={t.primary} strokeWidth={1.5} />
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: t.primary,
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
          {entry.queue_key}
        </Text>
        <View style={{ marginTop: 16 }}>
          <QueueProgress mode={entry.mode} queueKey={entry.queue_key} />
        </View>
        <Text style={{ marginTop: 12, fontSize: 12, lineHeight: 20, color: t.onSurfaceVariant }}>
          Communication begins after the cluster is formed. You can browse or join other matching
          modes while you wait.
        </Text>
      </Pressable>
    </Link>
  )
}

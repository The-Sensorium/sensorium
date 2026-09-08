import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Link, router, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react-native'
import { useMyQueueKeys, useLeaveQueue } from '../../../src/features/matching'
import { modeInfo, isMatchingMode } from '../../../src/lib/modes'
import { toErrorMessage } from '../../../src/lib/error'
import { radii } from '../../../src/lib/theme-tokens'
import { useTheme } from '../../../src/lib/use-theme'
import { Card, ErrorText, LoadingView, PrimaryButton, Screen } from '../../../src/components/ui'
import { usePullToRefresh } from '../../../src/lib/use-pull-to-refresh'
import { QueueProgress } from '../../../src/components/QueueCard'

export default function QueueScreen() {
  const t = useTheme()
  const { queueId = '' } = useLocalSearchParams<{ queueId: string }>()
  const queues = useMyQueueKeys()
  const leave = useLeaveQueue()
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const queryClient = useQueryClient()
  const pull = usePullToRefresh([
    () => queues.refetch(),
    () => queryClient.refetchQueries({ queryKey: ['queue-count'] }),
    () => queryClient.refetchQueries({ queryKey: ['matching-status'] }),
  ])

  const mode = isMatchingMode(queueId) ? queueId : null
  const entry = queues.data?.find((q) => q.mode === mode)

  if (!mode) {
    return (
      <Screen>
        <Card>
          <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface }}>
            Queue not found
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, color: t.onSurfaceVariant }}>
            That queue doesn’t exist. Head back to clusters to browse matching modes.
          </Text>
        </Card>
      </Screen>
    )
  }

  if (queues.isLoading) return <Screen><LoadingView /></Screen>

  if (!entry) {
    return (
      <Screen>
        <Card>
          <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface }}>
            You’re not in this queue
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, color: t.onSurfaceVariant }}>
            Join it from Clusters to see the live waiting count.
          </Text>
          <View style={{ marginTop: 20 }}>
            <Link href="/(app)/clusters" asChild>
              <PrimaryButton title="Go to Clusters" onPress={() => {}} />
            </Link>
          </View>
        </Card>
      </Screen>
    )
  }

  const current = entry
  const info = modeInfo(current.mode)
  const Icon = info.icon
  const leaving = leave.isPending

  async function handleLeave() {
    setLeaveError(null)
    try {
      await leave.mutateAsync(current.mode)
      router.replace('/(app)/home')
    } catch (err) {
      setLeaveError(toErrorMessage(err, 'Could not leave the queue. Try again.'))
    }
  }

  return (
    <Screen onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      <ErrorText message={pull.error} />
      <Pressable
        onPress={() => router.replace('/(app)/home')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}
      >
        <ArrowLeft size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
          Back to home
        </Text>
      </Pressable>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon size={14} color={t.primary} strokeWidth={1.5} />
          <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
            {info.label}
          </Text>
        </View>
        <Text style={{ marginTop: 4, fontSize: 22, fontWeight: '600', color: t.onSurface }}>
          {entry.queue_key}
        </Text>

        <View style={{ marginTop: 24 }}>
          <QueueProgress mode={entry.mode} queueKey={entry.queue_key} />
        </View>

        <Text style={{ marginTop: 24, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
          Communication begins after the cluster is formed. You can browse or join other matching
          modes while you wait.
        </Text>

        {confirming ? (
          <View style={{ marginTop: 24, flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton title="Confirm leave" onPress={() => void handleLeave()} loading={leaving} />
            </View>
            <Pressable
              onPress={() => setConfirming(false)}
              disabled={leaving}
              style={{ paddingHorizontal: 20, paddingVertical: 14, opacity: leaving ? 0.6 : 1 }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setConfirming(true)}
            style={{
              marginTop: 24,
              borderWidth: 1,
              borderColor: t.primary,
              borderRadius: radii.pill,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>Leave queue</Text>
          </Pressable>
        )}
        {leaveError ? (
          <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{leaveError}</Text>
        ) : null}
      </Card>

      <Text style={{ marginTop: 16, fontSize: 12, color: t.onSurfaceVariant }}>
        Want to match differently? <Link href="/(app)/clusters" style={{ fontWeight: '600', color: t.primary }}>Explore other modes</Link>.
      </Text>
    </Screen>
  )
}

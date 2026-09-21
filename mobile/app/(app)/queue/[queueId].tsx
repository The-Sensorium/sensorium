import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
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
import { WhatsNextSteps } from '../../../src/components/WhatsNextSteps'

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

  // expo-router can keep this route mounted across replace/back navigation,
  // so a confirm left over from a leave → rejoin cycle would otherwise greet
  // the user instead of the Leave queue button. Reset whenever focused.
  useFocusEffect(
    useCallback(() => {
      setConfirming(false)
      setLeaveError(null)
    }, []),
  )

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
  const displayKey = current.mode === 'open_mix' ? 'Open pool' : current.queue_key

  async function goBack() {
    if (router.canGoBack()) router.back()
    else if (mode) router.replace({ pathname: '/mode/[modeId]', params: { modeId: mode } })
    else router.replace('/(app)/home')
  }

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
        onPress={() => void goBack()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingVertical: 8, paddingRight: 16, marginBottom: 16 }}
      >
        <ArrowLeft size={18} color={t.primary} strokeWidth={1.5} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.primary }}>
          Back
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
          {displayKey}
        </Text>

        <View style={{ marginTop: 24 }}>
          <QueueProgress mode={entry.mode} queueKey={entry.queue_key} />
        </View>

        <WhatsNextSteps />

        <Text style={{ marginTop: 24, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
          You can browse or join other matching modes while you wait.
        </Text>

        {confirming ? (
          <View style={{ marginTop: 24, flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton title="Confirm leave" onPress={() => void handleLeave()} loading={leaving} />
            </View>
            <Pressable
              onPress={() => setConfirming(false)}
              disabled={leaving}
              hitSlop={4}
              style={{ paddingHorizontal: 20, paddingVertical: 12, minHeight: 48, justifyContent: 'center', opacity: leaving ? 0.6 : 1 }}
            >
              <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onSurfaceVariant }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setConfirming(true)}
            accessibilityRole="button"
            style={{
              marginTop: 24,
              borderWidth: 1,
              borderColor: t.primary,
              borderRadius: radii.pill,
              paddingVertical: 12,
              minHeight: 48,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.primary }}>Leave queue</Text>
          </Pressable>
        )}
        {leaveError ? (
          <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{leaveError}</Text>
        ) : null}
      </Card>

      <Text style={{ marginTop: 16, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, paddingVertical: 12, minHeight: 44 }}>
        Want to match differently? <Link href="/(app)/clusters" style={{ fontWeight: '600', color: t.primary }}>Explore other modes</Link>.
      </Text>
    </Screen>
  )
}

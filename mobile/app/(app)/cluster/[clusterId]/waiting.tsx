import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CheckCircle2, Clock } from 'lucide-react-native'
import { CLUSTER_SIZE } from '../../../../src/lib/constants'
import {
  useCluster,
  useMyMembership,
  useIntroProgress,
} from '../../../../src/features/introductions'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { Card, LoadingView, ProgressBar, Screen } from '../../../../src/components/ui'
import { CountdownTimer } from '../../../../src/components/CountdownTimer'

export default function WaitingScreen() {
  const t = useTheme()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const cluster = useCluster(clusterId || null)
  const membership = useMyMembership(clusterId || null)
  const progress = useIntroProgress(clusterId || null, clusterId !== '')

  const rows = progress.data ?? []
  const done = rows.filter((r) => r.intro_completed_at).length
  const allDone = rows.length > 0 && done === rows.length

  useEffect(() => {
    if (!allDone || cluster.data?.introductions_completed_at) return
    const id = setInterval(() => void cluster.refetch(), 3000)
    return () => clearInterval(id)
  }, [allDone, cluster.data?.introductions_completed_at, cluster])

  useEffect(() => {
    if (cluster.data && !membership.data?.intro_completed_at) {
      router.replace({ pathname: '/cluster/[clusterId]/introductions', params: { clusterId } })
    }
  }, [cluster.data, membership.data, clusterId])

  if (cluster.isLoading || membership.isLoading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    )
  }

  if (!cluster.data) {
    return (
      <Screen>
        <Card plain>
          <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
            This cluster isn’t available to you.
          </Text>
        </Card>
      </Screen>
    )
  }

  if (cluster.data.introductions_completed_at) {
    router.replace({ pathname: '/cluster/[clusterId]/room', params: { clusterId } })
    return (
      <Screen>
        <LoadingView />
      </Screen>
    )
  }

  if (!membership.data?.intro_completed_at) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    )
  }

  const deadline = cluster.data.introductions_deadline

  return (
    <Screen>
      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
        Introductions · {cluster.data.name}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 28, fontWeight: '600', color: t.onSurface }}>
        {allDone ? 'All introductions complete' : 'Waiting for the others'}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, color: t.onSurfaceVariant, marginBottom: 16 }}>
        {allDone
          ? 'Everyone has answered. Your cluster is unlocking. Chat is about to open.'
          : `${done} of ${CLUSTER_SIZE} introductions completed. Chat unlocks when everyone answers.`}
      </Text>
      {deadline ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <Clock size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
            Deadline: <CountdownTimer deadline={deadline} />
          </Text>
        </View>
      ) : null}

      <ProgressBar value={done} max={CLUSTER_SIZE} />

      <View style={{ marginTop: 16 }}>
        {progress.isLoading && rows.length === 0 ? (
          <LoadingView label="Loading progress…" />
        ) : (
          <View style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, overflow: 'hidden' }}>
            {rows.map((row) => {
              const isDone = !!row.intro_completed_at
              return (
                <View
                  key={row.user_id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: t.surfaceContainer,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isDone ? (
                      <CheckCircle2 size={20} color={t.primary} strokeWidth={1.5} />
                    ) : (
                      <Clock size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                      {row.display_name}
                    </Text>
                    <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                      {isDone ? 'Completed' : 'Still writing'}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </View>

      <Text style={{ marginTop: 16, fontSize: 12, lineHeight: 18, color: t.onSurfaceVariant }}>
        This page updates automatically. If someone leaves before finishing, the cluster re-fills
        from the queue and the deadline extends.
      </Text>
    </Screen>
  )
}

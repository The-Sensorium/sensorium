import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { CalendarDays, Compass, LogOut, Tag, Users } from 'lucide-react-native'
import { useCluster } from '../../../../src/features/introductions'
import { useClusterMembers } from '../../../../src/features/matching'
import { useLeaveCluster } from '../../../../src/features/cluster'
import { modeInfo, cooldownDaysForMode } from '../../../../src/lib/modes'
import { CLUSTER_SIZE } from '../../../../src/lib/constants'
import { toErrorMessage } from '../../../../src/lib/error'
import { errorHaptic, successHaptic } from '../../../../src/lib/haptics'
import { ClusterSectionHeader } from '../../../../src/components/ClusterMenu'
import { ClusterThemeProvider } from '../../../../src/lib/cluster-theme'
import { dateTimeFormatter } from '../../../../src/components/room/format'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { Card, PrimaryButton, Screen } from '../../../../src/components/ui'
import { Modal } from '../../../../src/components/Modal'

export default function ClusterSettingsScreen() {
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  return (
    <ClusterThemeProvider clusterId={clusterId || null}>
      <ClusterSettingsScreenContent />
    </ClusterThemeProvider>
  )
}

function ClusterSettingsScreenContent() {
  const t = useTheme()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const cluster = useCluster(clusterId || null)
  const members = useClusterMembers(clusterId || null)
  const leave = useLeaveCluster()
  const [confirming, setConfirming] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  // Same staleness as the queue screen: this route stays mounted across
  // replace/back navigation (and across clusterId param changes), so reset
  // the leave confirm whenever the screen is focused.
  useFocusEffect(
    useCallback(() => {
      setConfirming(false)
      setLeaveError(null)
    }, []),
  )
  const MatchedByIcon = cluster.data ? modeInfo(cluster.data.matching_mode).icon : Compass
  const created = cluster.data?.origin === 'created'

  async function handleLeave() {
    if (!clusterId) return
    setLeaveError(null)
    try {
      await leave.mutateAsync(clusterId)
      successHaptic()
      setConfirming(false)
      router.replace('/(app)/home')
    } catch (err) {
      errorHaptic()
      setLeaveError(toErrorMessage(err, 'Could not leave the cluster. Please try again.'))
    }
  }

  return (
    <Screen>
      <ClusterSectionHeader title="Settings" clusterId={clusterId} section="settings" />
      <Card>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>
            Cluster details
          </Text>
          <View style={{ marginTop: 12, gap: 10 }}>
            <DetailRow
              icon={<Tag size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />}
              label="Name"
              value={cluster.data?.name ?? '-'}
            />
            <DetailRow
              icon={<MatchedByIcon size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />}
              label="Matched by"
              value={cluster.data ? (created ? 'Created cluster' : modeInfo(cluster.data.matching_mode).label) : '-'}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Users size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>Members</Text>
              </View>
              <View style={{ backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurface }}>
                  {(members.data ?? []).length} / {CLUSTER_SIZE}
                </Text>
              </View>
            </View>
            <DetailRow
              icon={<CalendarDays size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />}
              label="Formed"
              value={cluster.data ? dateTimeFormatter.format(new Date(cluster.data.created_at)) : '-'}
            />
          </View>
        </View>
      </Card>

      <Card>
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.errorContainer, alignItems: 'center', justifyContent: 'center' }}
            >
              <LogOut size={16} color={t.error} strokeWidth={1.5} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>
              Leave cluster
            </Text>
          </View>
          <Text style={{ marginTop: 8, fontSize: 14, color: t.onSurfaceVariant }}>
            {created
              ? 'Leaving a created cluster frees your spot right away. There is no cooldown.'
              : `Leaving starts a ${cluster.data ? cooldownDaysForMode(cluster.data.matching_mode) : 7}-day cooldown for this matching mode and triggers a replacement search so the cluster can stay at 8.`}
          </Text>
          {confirming ? null : (
            <Pressable
              onPress={() => setConfirming(true)}
              accessibilityRole="button"
              accessibilityLabel="Leave cluster"
              style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: t.error, borderRadius: radii.pill, paddingVertical: 12, minHeight: 48 }}
            >
              <LogOut size={16} color={t.error} strokeWidth={1.5} />
              <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.error }}>
                Leave cluster
              </Text>
            </Pressable>
          )}
        </View>
      </Card>
      <Modal open={confirming} onClose={() => { if (!leave.isPending) setConfirming(false) }} title="Leave cluster?">
        <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
          {created
            ? 'Leaving frees your spot right away. There is no cooldown.'
            : `Leaving starts a ${cluster.data ? cooldownDaysForMode(cluster.data.matching_mode) : 7}-day cooldown for this matching mode and triggers a replacement search so the cluster can stay at 8.`}
        </Text>
        {leaveError ? (
          <Text accessibilityRole="alert" style={{ marginTop: 12, fontSize: 14, color: t.error }}>{leaveError}</Text>
        ) : null}
        <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <Pressable
            onPress={() => setConfirming(false)}
            disabled={leave.isPending}
            hitSlop={8}
            style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, justifyContent: 'center', opacity: leave.isPending ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
          </Pressable>
          <PrimaryButton
            title="Leave cluster"
            loadingTitle="Leaving…"
            loading={leave.isPending}
            tone="error"
            onPress={() => void handleLeave()}
          />
        </View>
      </Modal>
    </Screen>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon}
        <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: '500', color: t.onSurface }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

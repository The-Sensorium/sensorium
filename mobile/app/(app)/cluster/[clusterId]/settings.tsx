import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CalendarDays, Compass, LogOut, Tag, Users } from 'lucide-react-native'
import { useCluster } from '../../../../src/features/introductions'
import { useClusterMembers } from '../../../../src/features/matching'
import { useLeaveCluster } from '../../../../src/features/cluster'
import { modeInfo } from '../../../../src/lib/modes'
import { toErrorMessage } from '../../../../src/lib/error'
import { ClusterSectionHeader } from '../../../../src/components/ClusterMenu'
import { dateTimeFormatter } from '../../../../src/components/room/format'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { Card, Screen } from '../../../../src/components/ui'

export default function ClusterSettingsScreen() {
  const t = useTheme()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const cluster = useCluster(clusterId || null)
  const members = useClusterMembers(clusterId || null)
  const leave = useLeaveCluster()
  const [confirming, setConfirming] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const MatchedByIcon = cluster.data ? modeInfo(cluster.data.matching_mode).icon : Compass

  async function handleLeave() {
    if (!clusterId) return
    setLeaveError(null)
    try {
      await leave.mutateAsync(clusterId)
      router.replace('/(app)/home')
    } catch (err) {
      setLeaveError(toErrorMessage(err, 'Could not leave the cluster. Please try again.'))
      setConfirming(false)
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
              value={cluster.data ? modeInfo(cluster.data.matching_mode).label : '-'}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Users size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>Members</Text>
              </View>
              <View style={{ backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurface }}>
                  {(members.data ?? []).length} / 8
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
            Leaving starts a 30-day cooldown for this matching mode and triggers a replacement
            search so the cluster can stay at 8.
          </Text>
          {confirming ? (
            <View style={{ marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() => void handleLeave()}
                disabled={leave.isPending}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.error, borderRadius: radii.pill, paddingHorizontal: 20, paddingVertical: 12, opacity: leave.isPending ? 0.6 : 1 }}
              >
                {leave.isPending ? <ActivityIndicator size="small" color={t.onError} /> : null}
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onError }}>
                  Confirm leave
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirming(false)}
                disabled={leave.isPending}
                style={{ paddingHorizontal: 20, paddingVertical: 12, opacity: leave.isPending ? 0.6 : 1 }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setConfirming(true)}
              style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: t.error, borderRadius: radii.pill, paddingVertical: 12 }}
            >
              <LogOut size={16} color={t.error} strokeWidth={1.5} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.error }}>
                Leave cluster
              </Text>
            </Pressable>
          )}
          {leaveError ? (
            <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{leaveError}</Text>
          ) : null}
        </View>
      </Card>
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

import { Pressable, Text, View } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { Cake, MapPin, UserPlus } from 'lucide-react-native'
import { CLUSTER_SIZE } from '../../../../src/lib/constants'
import { useAuth } from '../../../../src/auth-context'
import { useClusterMembers } from '../../../../src/features/matching'
import { useReplacementRound } from '../../../../src/features/votes'
import { usePresence } from '../../../../src/features/realtime'
import { Avatar } from '../../../../src/components/Avatar'
import { AvailabilityBadge } from '../../../../src/components/AvailabilityBadge'
import { MuteButton } from '../../../../src/components/MuteButton'
import { PronounBadge } from '../../../../src/components/PronounBadge'
import { ClusterSectionHeader } from '../../../../src/components/ClusterMenu'
import { countryName } from '../../../../src/lib/countries'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { ErrorText, LoadingView, Screen } from '../../../../src/components/ui'
import { usePullToRefresh } from '../../../../src/lib/use-pull-to-refresh'

export default function MembersScreen() {
  const t = useTheme()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const members = useClusterMembers(clusterId || null)
  const { online } = usePresence(clusterId || null)
  const replacement = useReplacementRound(clusterId || null)
  const pull = usePullToRefresh([() => members.refetch(), () => replacement.refetch()])

  if (members.isLoading) {
    return (
      <Screen>
        <ClusterSectionHeader title="Members" clusterId={clusterId} section="members" />
        <LoadingView label="Loading members…" />
      </Screen>
    )
  }

  const list = members.data ?? []
  const isOnline = (id: string) => online.has(id) || id === userId

  return (
    <Screen onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      <ClusterSectionHeader title="Members" clusterId={clusterId} section="members" />
      <ErrorText message={pull.error} />
      {replacement.data ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: t.tertiaryContainer,
            borderRadius: radii.md,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 12,
          }}
        >
          <View
            style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            <UserPlus size={14} color={t.tertiary} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurface }}>
              A spot just opened
            </Text>
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
              We&apos;re {list.length} of {CLUSTER_SIZE}, finding a new member.
            </Text>
          </View>
        </View>
      ) : null}
      {list.length === 0 ? (
        <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
          No members yet.
        </Text>
      ) : (
        list.map((member) => {
          const onlineNow = isOnline(member.id)
          return (
            <Link
              key={member.id}
              href={{ pathname: '/profile/[userId]', params: { userId: member.id, cluster: clusterId } }}
              asChild
            >
              <Pressable
                style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: 16, marginBottom: 12 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={member.display_name} src={member.avatar_url} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                      {member.display_name}
                    </Text>
                    {member.pronouns ? (
                      <View style={{ marginTop: 4, alignSelf: 'flex-start' }}>
                        <PronounBadge pronouns={member.pronouns} />
                      </View>
                    ) : null}
                    <View style={{ marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                      {member.country_code ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <MapPin size={12} color={t.onSurfaceVariant} strokeWidth={1.5} />
                          <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                            {countryName(member.country_code)}
                          </Text>
                        </View>
                      ) : null}
                      {member.birth_year ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Cake size={12} color={t.onSurfaceVariant} strokeWidth={1.5} />
                          <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                            {member.birth_year}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
                <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    {onlineNow ? (
                      <AvailabilityBadge value={member.availability} />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.onSurfaceVariant }} />
                        <Text style={{ fontSize: 12, fontWeight: '500', color: t.onSurfaceVariant }}>
                          Offline
                        </Text>
                      </View>
                    )}
                    {member.current_status ? (
                      <Text style={{ fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1}>
                        “{member.current_status}”
                      </Text>
                    ) : null}
                  </View>
                  {member.id !== userId ? (
                    <MuteButton targetUserId={member.id} targetName={member.display_name} />
                  ) : null}
                </View>
              </Pressable>
            </Link>
          )
        })
      )}
    </Screen>
  )
}

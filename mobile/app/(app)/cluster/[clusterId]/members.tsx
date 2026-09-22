import { Pressable, Text, View } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { Cake, MapPin, UserPlus } from 'lucide-react-native'
import { CLUSTER_SIZE } from '../../../../src/lib/constants'
import { useAuth } from '../../../../src/auth-context'
import { useClusterMembers } from '../../../../src/features/matching'
import { useReplacementRound } from '../../../../src/features/votes'
import { usePresence } from '../../../../src/features/realtime'
import { Avatar } from '../../../../src/components/Avatar'
import { MuteButton } from '../../../../src/components/MuteButton'
import { PronounBadge } from '../../../../src/components/PronounBadge'
import { ClusterSectionHeader } from '../../../../src/components/ClusterMenu'
import { countryName } from '../../../../src/lib/countries'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { useResolvedScheme } from '../../../../src/lib/theme-choice'
import { ErrorText, LoadingView, Screen } from '../../../../src/components/ui'
import { IntroChecklistBanner } from '../../../../src/components/IntroChecklistBanner'
import { usePullToRefresh } from '../../../../src/lib/use-pull-to-refresh'

export default function MembersScreen() {
  const t = useTheme()
  const scheme = useResolvedScheme()
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
      <IntroChecklistBanner key={clusterId} clusterId={clusterId} dismissible={false} />
      {replacement.data ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: t.surfaceContainer,
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.md,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 12,
          }}
        >
          <View
            style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.surfaceHighest, alignItems: 'center', justifyContent: 'center' }}
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
                  <View style={{ position: 'relative' }}>
                    <Avatar name={member.display_name} src={member.avatar_url} size={44} />
                    {onlineNow ? (
                      <View
                        style={{
                          position: 'absolute',
                          bottom: -2,
                          right: -2,
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          borderWidth: 2,
                          borderColor: t.surface,
                          backgroundColor: scheme === 'dark' ? '#34d399' : '#10b981',
                        }}
                      />
                    ) : null}
                    <Text style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
                      {onlineNow ? 'Online' : 'Offline'}
                    </Text>
                  </View>
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
                {member.current_status || member.id !== userId ? (
                  <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flex: 1, flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {member.current_status ? (
                        <Text style={{ flex: 1, flexShrink: 1, fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1} ellipsizeMode="tail">
                          “{member.current_status}”
                        </Text>
                      ) : null}
                    </View>
                    {member.id !== userId ? (
                      <View style={{ flexShrink: 0 }}>
                        <MuteButton targetUserId={member.id} targetName={member.display_name} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            </Link>
          )
        })
      )}
    </Screen>
  )
}

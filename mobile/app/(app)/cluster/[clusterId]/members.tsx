import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { Cake, UserPlus } from 'lucide-react-native'
import { CLUSTER_SIZE } from '../../../../src/lib/constants'
import { useAuth } from '../../../../src/auth-context'
import { useClusterMembers } from '../../../../src/features/matching'
import { useCluster } from '../../../../src/features/introductions'
import { useReplacementRound } from '../../../../src/features/votes'
import { usePresence } from '../../../../src/features/realtime'
import { Avatar } from '../../../../src/components/Avatar'
import { CountryFlag } from '../../../../src/components/CountryFlag'
import { MemberLocalTime } from '../../../../src/components/MemberLocalTime'
import { MemberMenuButton, MemberMenuPopover, type MemberMenuTarget } from '../../../../src/components/MemberCardMenu'
import { PronounBadge } from '../../../../src/components/PronounBadge'
import { ReportModal } from '../../../../src/components/ReportModal'
import { ClusterSectionHeader } from '../../../../src/components/ClusterMenu'
import { countryName } from '../../../../src/lib/countries'
import { isValidTimeZone } from '../../../../src/lib/timezones'
import { radii, shadowShape } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { useResolvedScheme } from '../../../../src/lib/theme-choice'
import { ErrorText, LoadingView, Screen } from '../../../../src/components/ui'
import { IntroChecklistBanner } from '../../../../src/components/IntroChecklistBanner'
import { CreatedPendingSection } from '../../../../src/components/created/CreatedPendingSection'
import { usePullToRefresh } from '../../../../src/lib/use-pull-to-refresh'

export default function MembersScreen() {
  const t = useTheme()
  const scheme = useResolvedScheme()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const members = useClusterMembers(clusterId || null)
  const cluster = useCluster(clusterId || null)
  const { online } = usePresence(clusterId || null)
  const replacement = useReplacementRound(clusterId || null)
  const pull = usePullToRefresh([() => members.refetch(), () => replacement.refetch()])
  const [menuFor, setMenuFor] = useState<MemberMenuTarget | null>(null)
  const [reportFor, setReportFor] = useState<{ id: string; name: string } | null>(null)

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
      {cluster.data?.origin === 'created' ? (
        <CreatedPendingSection
          clusterId={clusterId}
          confirmedCount={list.length}
          confirmedIds={list.map((m) => m.id)}
          isCreator={cluster.data.created_by === userId}
        />
      ) : null}
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
          const hasLocalTime = !!member.timezone && isValidTimeZone(member.timezone)
          return (
            <View
              key={member.id}
              style={{
                backgroundColor: t.surfaceLowest,
                borderRadius: radii.xl,
                padding: 16,
                marginBottom: 12,
                ...shadowShape,
                shadowColor: t.shadowColor,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Link
                  href={{ pathname: '/profile/[userId]', params: { userId: member.id, cluster: clusterId } }}
                  asChild
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View ${member.display_name}'s profile`}
                    style={{ flex: 1 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
                      <View style={{ position: 'relative' }}>
                        <Avatar name={member.display_name} src={member.avatar_url} size={56} />
                        {onlineNow ? (
                          <View
                            style={{
                              position: 'absolute',
                              bottom: -2,
                              right: -2,
                              width: 16,
                              height: 16,
                              borderRadius: 8,
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
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                          <Text style={{ flexShrink: 1, fontSize: 16, lineHeight: 22, fontWeight: '600', color: t.onSurface }} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                            {member.display_name}
                          </Text>
                          {member.pronouns ? (
                            <PronounBadge pronouns={member.pronouns} />
                          ) : null}
                        </View>
                        {member.country_code || member.birth_year || hasLocalTime ? (
                          <View style={{ marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                            {member.country_code ? (
                              <CountryFlag
                                code={member.country_code}
                                label={countryName(member.country_code)}
                              />
                            ) : null}
                            {member.country_code && (member.birth_year || hasLocalTime) ? (
                              <View style={{ width: 1, height: 14, backgroundColor: t.outlineVariant, opacity: 0.6 }} />
                            ) : null}
                            {member.birth_year ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Cake size={12} color={t.onSurfaceVariant} strokeWidth={1.5} />
                                <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                                  {member.birth_year}
                                </Text>
                              </View>
                            ) : null}
                            {member.birth_year && hasLocalTime ? (
                              <View style={{ width: 1, height: 14, backgroundColor: t.outlineVariant, opacity: 0.6 }} />
                            ) : null}
                            {hasLocalTime ? <MemberLocalTime timeZone={member.timezone} /> : null}
                          </View>
                        ) : null}
                        {member.current_status ? (
                          <Text style={{ marginTop: 6, fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1} ellipsizeMode="tail">
                            “{member.current_status}”
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                </Link>
                <MemberMenuButton member={member} onOpen={setMenuFor} />
              </View>
            </View>
          )
        })
      )}
      <MemberMenuPopover
        target={menuFor}
        clusterId={clusterId}
        isSelf={menuFor !== null && menuFor.id === userId}
        onClose={() => setMenuFor(null)}
        onReport={(target) => {
          setMenuFor(null)
          setReportFor(target)
        }}
      />
      {reportFor ? (
        <ReportModal
          open
          onClose={() => setReportFor(null)}
          clusterId={clusterId}
          target={reportFor}
        />
      ) : null}
    </Screen>
  )
}

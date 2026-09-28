import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Link, router, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, Briefcase, Cake, Flag, Heart, Sparkles, Target, Telescope, Users } from 'lucide-react-native'
import { useClusterMembers, useMyClusters } from '../../../src/features/matching'
import { usePresence } from '../../../src/features/realtime'
import { useMemberIntroAnswers, useIntroQuestionMap } from '../../../src/features/cluster'
import {
  useUserPosts,
  usePostLikesForPosts,
  usePostCommentsForPosts,
  useTogglePostLikeForPost,
} from '../../../src/features/posts'
import { useAuth } from '../../../src/auth-context'
import { AvatarViewer } from '../../../src/components/AvatarViewer'
import { AvailabilityBadge } from '../../../src/components/AvailabilityBadge'
import { CountryFlag } from '../../../src/components/CountryFlag'
import { MemberLocalTime } from '../../../src/components/MemberLocalTime'
import { PronounBadge } from '../../../src/components/PronounBadge'
import { ReportModal } from '../../../src/components/ReportModal'
import { LinkifiedText } from '../../../src/components/LinkifiedText'
import { PostCard } from '../../../src/components/PostCard'
import { MuteButton } from '../../../src/components/MuteButton'
import { countryName } from '../../../src/lib/countries'
import { isValidTimeZone } from '../../../src/lib/timezones'
import { radii } from '../../../src/lib/theme-tokens'
import { useTheme } from '../../../src/lib/use-theme'
import { Card, LoadingView, Screen } from '../../../src/components/ui'

const INTRO_ICONS = [Briefcase, Heart, Target, Users, Telescope]

export default function ProfileScreen() {
  const t = useTheme()
  const { userId = '', cluster = '' } = useLocalSearchParams<{ userId: string; cluster: string }>()
  const clusterId = cluster
  const members = useClusterMembers(clusterId || null)
  const introAnswers = useMemberIntroAnswers(clusterId || null, userId || null)
  const questions = useIntroQuestionMap()
  const myClusters = useMyClusters()
  const auth = useAuth()
  const selfId = auth.state === 'signedIn' ? auth.userId : null
  const isSelf = selfId !== null && selfId === userId
  const { online } = usePresence(clusterId || null)
  const onlineNow = online.has(userId) || isSelf
  const [reportOpen, setReportOpen] = useState(false)
  const userPosts = useUserPosts(userId || null)
  const profilePostIds = useMemo(
    () => [...new Set((userPosts.data ?? []).map((p) => p.id))],
    [userPosts.data],
  )
  const postLikes = usePostLikesForPosts(profilePostIds)
  const postComments = usePostCommentsForPosts(profilePostIds)
  const toggleLike = useTogglePostLikeForPost()
  const likesByPost = useMemo(() => {
    const byPost = new Map<string, { count: number; mine: boolean }>()
    for (const l of postLikes.data ?? []) {
      const entry = byPost.get(l.post_id) ?? { count: 0, mine: false }
      entry.count += 1
      if (l.user_id === selfId) entry.mine = true
      byPost.set(l.post_id, entry)
    }
    return byPost
  }, [postLikes.data, selfId])
  const commentsByPost = useMemo(() => {
    const byPost = new Map<string, number>()
    for (const c of postComments.data ?? []) {
      byPost.set(c.post_id, (byPost.get(c.post_id) ?? 0) + 1)
    }
    return byPost
  }, [postComments.data])

  if (!clusterId) {
    router.replace('/(app)/home')
    return null
  }

  if (members.isLoading || myClusters.isLoading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    )
  }

  const member = (members.data ?? []).find((m) => m.id === userId)
  const clusterInfo = (myClusters.data ?? []).find((c) => c.cluster.id === clusterId)
  const hasLocalTime = !!member?.timezone && isValidTimeZone(member.timezone)

  if (!member) {
    return (
      <Screen>
        <Card plain>
          <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
            This member isn&apos;t in your cluster.
          </Text>
        </Card>
      </Screen>
    )
  }

  const answers = introAnswers.data ?? []

  return (
    <Screen>
      <Link
        href={{ pathname: '/cluster/[clusterId]/members', params: { clusterId } }}
        asChild
      >
        <Pressable hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, minHeight: 44, marginBottom: 4 }}>
          <ArrowLeft size={16} color={t.primary} strokeWidth={1.5} />
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.primary }}>
            Back to members
          </Text>
        </Pressable>
      </Link>

      <Card>
        <View style={{ alignItems: 'center' }}>
          <AvatarViewer name={member.display_name} src={member.avatar_url} size={128} />
          {member.pronouns ? (
            <View style={{ marginTop: 12, alignItems: 'center' }}>
              <PronounBadge pronouns={member.pronouns} />
            </View>
          ) : null}
          <Text style={{ marginTop: 6, fontSize: 20, lineHeight: 28, fontWeight: '600', color: t.onSurface, textAlign: 'center' }} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {member.display_name}
          </Text>
          <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              {member.country_code ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <CountryFlag code={member.country_code} />
                  <Text style={{ fontSize: 13, lineHeight: 18, color: t.onSurfaceVariant, textAlign: 'left' }}>
                    {countryName(member.country_code)}
                  </Text>
                </View>
              ) : null}
              {member.country_code && hasLocalTime ? (
                <View style={{ width: 1, height: 16, backgroundColor: t.outlineVariant, opacity: 0.6 }} />
              ) : null}
              {hasLocalTime ? (
                <View accessibilityLabel="Member local time">
                  <MemberLocalTime timeZone={member.timezone} fontSize={13} />
                </View>
              ) : null}
              {member.country_code || hasLocalTime ? (
                <View style={{ width: 1, height: 16, backgroundColor: t.outlineVariant, opacity: 0.6 }} />
              ) : null}
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
            </View>
        </View>

        {member.current_status ? (
          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.surfaceContainer, alignItems: 'flex-start' }}>
            <View
              accessibilityLabel={`Status: ${member.current_status}`}
              style={{ width: '100%' }}
            >
              <LinkifiedText text={member.current_status} fontSize={14} lineHeight={20} color={t.onSurfaceVariant} italic />
            </View>
          </View>
        ) : null}

        {!isSelf ? (
          <View>
            <Link href={{ pathname: '/cluster/[clusterId]/room', params: { clusterId } }} asChild>
              <Pressable
                accessibilityRole="button"
                style={{ marginTop: 16, backgroundColor: t.primary, borderRadius: radii.pill, paddingVertical: 12, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onPrimary }}>
                  Message {member.display_name}
                </Text>
              </Pressable>
            </Link>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <MuteButton targetUserId={member.id} targetName={member.display_name} fill />
              </View>
              <Pressable
                onPress={() => setReportOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Report member"
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48 }}
              >
                <Flag size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onSurfaceVariant }}>
                  Report
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Link href="/(app)/settings" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
              style={{ marginTop: 16, backgroundColor: t.primary, borderRadius: radii.pill, paddingVertical: 12, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onPrimary }}>
                Edit profile
              </Text>
            </Pressable>
          </Link>
        )}
      </Card>

      {member.birth_year || clusterInfo ? (
        <Card>
          <View style={{ flexDirection: 'row' }}>
            {member.birth_year ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Cake size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary, textAlign: 'left' }}>
                    Born
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 14, color: t.onSurfaceVariant, textAlign: 'left' }}>
                    {member.birth_year}
                  </Text>
                </View>
              </View>
            ) : null}
            {clusterInfo ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderLeftWidth: member.birth_year ? 1 : 0, borderLeftColor: t.outlineVariant, paddingLeft: member.birth_year ? 16 : 0 }}>
                <Users size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary, textAlign: 'left' }}>
                    Cluster
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 14, color: t.onSurfaceVariant, textAlign: 'left' }} numberOfLines={2}>
                    {clusterInfo.cluster.name}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      {member.bio ? (
        <Card>
          <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary, textAlign: 'left' }}>
            About
          </Text>
          <View style={{ marginTop: 4, flexDirection: 'row', gap: 12 }}>
            <Text accessible={false} style={{ fontSize: 48, lineHeight: 52, color: t.onSurfaceVariant, opacity: 0.6 }}>
              “
            </Text>
            <View style={{ flex: 1, paddingVertical: 16 }}>
              <LinkifiedText
                text={member.bio}
                fontSize={14}
                lineHeight={20}
              />
            </View>
            <Text accessible={false} style={{ fontSize: 48, lineHeight: 52, color: t.onSurfaceVariant, opacity: 0.6, alignSelf: 'flex-end' }}>
              ”
            </Text>
          </View>
        </Card>
      ) : null}

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        clusterId={clusterId}
        target={{ id: member.id, name: member.display_name }}
      />

      <Card>
        <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: '600', color: t.onSurface, marginBottom: 12 }}>
          Introductions
        </Text>
        {introAnswers.isLoading ? (
          <LoadingView />
        ) : answers.length === 0 ? (
          <View>
            <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
              {isSelf
                ? 'You have not completed your introductions yet.'
                : `${member.display_name} hasn't completed their introductions.`}
            </Text>
            {isSelf ? (
              <Link
                href={{ pathname: '/cluster/[clusterId]/introductions', params: { clusterId } }}
                asChild
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Complete your introductions"
                  style={{ marginTop: 12, backgroundColor: t.primary, borderRadius: radii.pill, paddingVertical: 12, minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}
                >
                  <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onPrimary }}>
                    Complete your introductions
                  </Text>
                </Pressable>
              </Link>
            ) : null}
          </View>
        ) : (
          answers.map((a) => {
            const Icon = INTRO_ICONS[a.question_id - 1] ?? Sparkles
            const prompt = questions.data?.get(a.question_id) ?? `Question ${a.question_id}`
            return (
              <View key={a.question_id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10 }}>
                <View
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.surfaceContainer, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon size={20} color={t.primary} strokeWidth={1.5} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: t.primary }}>{prompt}</Text>
                  <View style={{ marginTop: 2 }}>
                    <LinkifiedText text={a.answer} fontSize={14} lineHeight={20} color={t.onSurfaceVariant} />
                  </View>
                </View>
              </View>
            )
          })
        )}
      </Card>

      {!userPosts.isLoading && (userPosts.data ?? []).length > 0 ? (
        <>
          <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: '600', color: t.onSurface, marginTop: 20, marginBottom: 12 }}>
            Posts
          </Text>
          {(userPosts.data ?? []).map((post) => {
            const like = likesByPost.get(post.id)
            return (
              <PostCard
                key={post.id}
                post={post}
                clusterId={post.cluster_id}
                compact
                author={member}
                likeCount={like?.count ?? 0}
                likedByMe={like?.mine ?? false}
                commentCount={commentsByPost.get(post.id) ?? 0}
                onLike={(id) => void toggleLike.mutateAsync({ postId: id, clusterId: post.cluster_id })}
              />
            )
          })}
        </>
      ) : null}
    </Screen>
  )
}

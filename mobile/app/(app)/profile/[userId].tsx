import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Link, router, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, Briefcase, Cake, Flag, Heart, MapPin, Sparkles, Target, Telescope, Users } from 'lucide-react-native'
import { useClusterMembers, useMyClusters } from '../../../src/features/matching'
import { usePresence } from '../../../src/features/realtime'
import { useMemberIntroAnswers, useIntroQuestionMap } from '../../../src/features/cluster'
import {
  useUserPosts,
  useClusterPostLikes,
  useClusterPostComments,
  useTogglePostLike,
} from '../../../src/features/posts'
import { useAuth } from '../../../src/auth-context'
import { Avatar } from '../../../src/components/Avatar'
import { AvailabilityBadge } from '../../../src/components/AvailabilityBadge'
import { PronounBadge } from '../../../src/components/PronounBadge'
import { ReportModal } from '../../../src/components/ReportModal'
import { PostCard } from '../../../src/components/PostCard'
import { MuteButton } from '../../../src/components/MuteButton'
import { countryName } from '../../../src/lib/countries'
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
  const userPostIds = (userPosts.data ?? []).map((p) => p.id)
  const postLikes = useClusterPostLikes(clusterId || null, userPostIds)
  const postComments = useClusterPostComments(clusterId || null, userPostIds)
  const toggleLike = useTogglePostLike(clusterId || null)
  const likesByPost = new Map<string, { count: number; mine: boolean }>()
  for (const l of postLikes.data ?? []) {
    const entry = likesByPost.get(l.post_id) ?? { count: 0, mine: false }
    entry.count += 1
    if (l.user_id === selfId) entry.mine = true
    likesByPost.set(l.post_id, entry)
  }
  const commentsByPost = new Map<string, number>()
  for (const c of postComments.data ?? []) {
    commentsByPost.set(c.post_id, (commentsByPost.get(c.post_id) ?? 0) + 1)
  }

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
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <ArrowLeft size={16} color={t.primary} strokeWidth={1.5} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
            Back to members
          </Text>
        </Pressable>
      </Link>

      <Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Avatar name={member.display_name} src={member.avatar_url} size={80} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                {member.display_name}
              </Text>
              {member.pronouns ? <PronounBadge pronouns={member.pronouns} /> : null}
            </View>
            <View style={{ marginTop: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {member.country_code ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MapPin size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
                  <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
                    {countryName(member.country_code)}
                  </Text>
                </View>
              ) : null}
              {member.birth_year ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Cake size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
                  <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
                    Born {member.birth_year}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={{ marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
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
                <Text style={{ fontSize: 12, fontStyle: 'italic', color: t.onSurfaceVariant }}>
                  &quot;{member.current_status}&quot;
                </Text>
              ) : null}
            </View>
            {member.bio ? (
              <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
                {member.bio}
              </Text>
            ) : null}
          </View>
        </View>

        {clusterInfo ? (
          <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.surfaceContainer }}>
            <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
              Your cluster
            </Text>
            <Text style={{ marginTop: 6, fontSize: 14, fontWeight: '500', color: t.onSurface }}>
              {clusterInfo.cluster.name}
            </Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: t.onSurfaceVariant }}>
              {clusterInfo.memberCount} / 8 members
            </Text>
          </View>
        ) : null}

        {!isSelf ? (
          <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.surfaceContainer, gap: 8 }}>
            <Link href={{ pathname: '/cluster/[clusterId]/room', params: { clusterId } }} asChild>
              <Pressable
                style={{ backgroundColor: t.primary, borderRadius: radii.pill, paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onPrimary }}>
                  Message {member.display_name}
                </Text>
              </Pressable>
            </Link>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <MuteButton targetUserId={member.id} targetName={member.display_name} fill />
              </View>
              <Pressable
                onPress={() => setReportOpen(true)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 8 }}
              >
                <Flag size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                  Report
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Card>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        clusterId={clusterId}
        target={{ id: member.id, name: member.display_name }}
      />

      <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface, marginTop: 20, marginBottom: 12 }}>
        Introductions
      </Text>
      <Card>
        {introAnswers.isLoading ? (
          <LoadingView />
        ) : answers.length === 0 ? (
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
            {member.display_name} hasn&apos;t completed their introductions.
          </Text>
        ) : (
          answers.map((a) => {
            const Icon = INTRO_ICONS[a.question_id - 1] ?? Sparkles
            const prompt = questions.data?.get(a.question_id) ?? `Question ${a.question_id}`
            return (
              <View key={a.question_id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12 }}>
                <View
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceContainer, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon size={16} color={t.primary} strokeWidth={1.5} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>{prompt}</Text>
                  <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
                    {a.answer}
                  </Text>
                </View>
              </View>
            )
          })
        )}
      </Card>

      {!userPosts.isLoading && (userPosts.data ?? []).length > 0 ? (
        <>
          <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface, marginTop: 20, marginBottom: 12 }}>
            Posts
          </Text>
          {(userPosts.data ?? []).map((post) => {
            const like = likesByPost.get(post.id)
            return (
              <PostCard
                key={post.id}
                post={post}
                clusterId={clusterId}
                compact
                author={member}
                likeCount={like?.count ?? 0}
                likedByMe={like?.mine ?? false}
                commentCount={commentsByPost.get(post.id) ?? 0}
                onLike={(id) => void toggleLike.mutateAsync(id)}
              />
            )
          })}
        </>
      ) : null}
    </Screen>
  )
}

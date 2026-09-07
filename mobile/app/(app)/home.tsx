import { useEffect, useMemo } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link, router, type Href } from 'expo-router'
import { ArrowRight, MailOpen, PartyPopper, Sparkles } from 'lucide-react-native'
import { useAuth } from '../../src/auth-context'
import { useProfile } from '../../src/lib/use-profile'
import { useClusterMembers, useMyClusters, useLatestClusterFormed } from '../../src/features/matching'
import {
  useRecentClusterPosts,
  usePostLikes,
  usePostComments,
  useTogglePostLike,
  type Post,
} from '../../src/features/posts'
import {
  useMyPendingInvitations,
  useAcceptInvitation,
  useDeclineInvitation,
} from '../../src/features/votes'
import { toErrorMessage } from '../../src/lib/error'
import { radii } from '../../src/lib/theme-tokens'
import { useTheme } from '../../src/lib/use-theme'
import { Card, LoadingView, PrimaryButton, Screen } from '../../src/components/ui'
import { ClusterCard } from '../../src/components/ClusterCard'
import { PostCard } from '../../src/components/PostCard'

function daypartGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 23) return 'Good evening'
  return 'Good night'
}

const GET_STARTED_STEPS: { to: Href; title: string; desc: string }[] = [
  {
    to: '/(app)/settings',
    title: 'Set up your profile',
    desc: 'Add a photo, bio and status so your cluster knows who you are.',
  },
  {
    to: { pathname: '/mode/[modeId]', params: { modeId: 'local' } },
    title: 'Set your local area',
    desc: 'Pick a radius and you’ll be matched with people nearby.',
  },
  {
    to: '/(app)/clusters',
    title: 'Join a queue',
    desc: 'Choose a matching mode. Clusters form when 8 people match.',
  },
]

export default function HomeScreen() {
  const t = useTheme()
  const auth = useAuth()
  const profile = useProfile()
  const clusters = useMyClusters()
  const formed = useLatestClusterFormed()
  const invitations = useMyPendingInvitations()
  const acceptInvite = useAcceptInvitation()
  const declineInvite = useDeclineInvitation()

  useEffect(() => {
    if (
      auth.state === 'signedIn' &&
      !profile.isLoading &&
      !profile.data?.onboarding_completed_at
    ) {
      router.replace('/(onboarding)')
    }
  }, [auth.state, profile.isLoading, profile.data])

  const clusterIds = useMemo(() => (clusters.data ?? []).map((c) => c.cluster.id), [clusters.data])
  const clusterNameById = useMemo(
    () => new Map((clusters.data ?? []).map((c) => [c.cluster.id, c.cluster.name])),
    [clusters.data],
  )

  if (profile.isLoading || !profile.data?.onboarding_completed_at) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    )
  }

  const firstName = profile.data?.display_name?.split(' ')[0]
  const inviteError =
    toErrorMessage(acceptInvite.error, '') || toErrorMessage(declineInvite.error, '') || null
  const loading = clusters.isLoading || invitations.isLoading
  const hasClusters = (clusters.data?.length ?? 0) > 0
  const hasInvites = (invitations.data?.length ?? 0) > 0
  const isFresh = !loading && !hasClusters && !hasInvites && !formed.data
  const listError =
    (clusters.isError ? 'Couldn’t load your clusters.' : '') ||
    (invitations.isError ? 'Couldn’t load your invitations.' : '')

  return (
    <Screen>
      <Text style={{ fontSize: 28, fontWeight: '600', color: t.onSurface }}>
        {firstName ? `Welcome, ${firstName}` : 'Home'}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 17, color: t.onSurfaceVariant, marginBottom: 24 }}>
        {daypartGreeting()}
      </Text>

      {(invitations.data ?? []).map((inv) => (
        <Card key={inv.id}>
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: t.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MailOpen size={20} color={t.onPrimary} strokeWidth={1.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>
                  You’re invited to join a cluster
                </Text>
                <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
                  {inv.cluster_name} · {inv.mode_label}
                </Text>
              </View>
            </View>
            {inviteError ? (
              <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{inviteError}</Text>
            ) : null}
            <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Accept"
                  loading={acceptInvite.isPending}
                  onPress={() => void acceptInvite.mutateAsync(inv.id).catch(() => {})}
                />
              </View>
              <Pressable
                disabled={acceptInvite.isPending || declineInvite.isPending}
                onPress={() => void declineInvite.mutateAsync(inv.id).catch(() => {})}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: t.outlineVariant,
                  borderRadius: radii.pill,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: acceptInvite.isPending || declineInvite.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Decline</Text>
              </Pressable>
            </View>
          </View>
        </Card>
      ))}

      {listError ? (
        <Card>
          <Text style={{ fontSize: 14, color: t.error }}>{listError} Please try again.</Text>
        </Card>
      ) : null}

      {formed.data ? (
        <Link href="/cluster-created" asChild>
          <Pressable
            style={{
              backgroundColor: t.surfaceContainer,
              borderRadius: radii.xl,
              padding: 20,
              marginBottom: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: t.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PartyPopper size={20} color={t.onPrimary} strokeWidth={1.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>
                Your cluster is ready
              </Text>
              <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
                Eight of you were matched. Start your introductions.
              </Text>
            </View>
            <ArrowRight size={20} color={t.primary} />
          </Pressable>
        </Link>
      ) : null}

      {loading ? (
        <LoadingView />
      ) : isFresh ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} color={t.primary} strokeWidth={1.5} />
            <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface }}>
              Welcome to Sensorium
            </Text>
          </View>
          <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
            You’re matched into clusters of 8 strangers. Here’s how to get started.
          </Text>
          <View style={{ marginTop: 16, gap: 12 }}>
            {GET_STARTED_STEPS.map((step, i) => (
              <Link key={step.title} href={step.to} asChild>
                <Pressable
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: t.surface,
                    borderRadius: radii.md,
                    padding: 16,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: t.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: t.onPrimary }}>
                      {i + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                      {step.title}
                    </Text>
                    <Text style={{ marginTop: 2, fontSize: 12, lineHeight: 18, color: t.onSurfaceVariant }}>
                      {step.desc}
                    </Text>
                  </View>
                  <ArrowRight size={16} color={t.primary} />
                </Pressable>
              </Link>
            ))}
          </View>
        </Card>
      ) : (
        hasClusters && (
          <View>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}
            >
              <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface }}>
                Your clusters
              </Text>
              <Link href="/(app)/clusters" asChild>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
                    View all clusters
                  </Text>
                  <ArrowRight size={16} color={t.primary} />
                </Pressable>
              </Link>
            </View>
            {(clusters.data ?? []).map((item) => (
              <ClusterCard key={item.cluster.id} item={item} />
            ))}
            <RecentFromClusters clusterIds={clusterIds} clusterNameById={clusterNameById} />
          </View>
        )
      )}
    </Screen>
  )
}

function RecentFromClusters({
  clusterIds,
  clusterNameById,
}: {
  clusterIds: string[]
  clusterNameById: Map<string, string>
}) {
  const t = useTheme()
  const recent = useRecentClusterPosts(clusterIds, 3)

  return (
    <View style={{ marginTop: 24 }}>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}
      >
        <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface }}>
          Recent posts
        </Text>
        <Link href="/(app)/posts" asChild>
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
              View all posts
            </Text>
            <ArrowRight size={16} color={t.primary} />
          </Pressable>
        </Link>
      </View>
      {recent.isLoading ? (
        <LoadingView />
      ) : recent.isError ? (
        <Card>
          <Text style={{ fontSize: 14, color: t.error }}>
            Couldn’t load recent posts. Please try again.
          </Text>
        </Card>
      ) : (recent.data ?? []).length === 0 ? (
        <Card plain>
          <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
            No posts in your clusters yet. Be the first to share something.
          </Text>
        </Card>
      ) : (
        (recent.data ?? []).map((post) => (
          <RecentPostItem
            key={post.id}
            post={post}
            clusterName={clusterNameById.get(post.cluster_id)}
          />
        ))
      )}
    </View>
  )
}

function RecentPostItem({ post, clusterName }: { post: Post; clusterName: string | undefined }) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const members = useClusterMembers(post.cluster_id)
  const likes = usePostLikes(post.id)
  const comments = usePostComments(post.cluster_id, post.id)
  const toggle = useTogglePostLike(post.cluster_id)

  const memberById = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m])),
    [members.data],
  )

  return (
    <PostCard
      post={post}
      clusterId={post.cluster_id}
      clusterName={clusterName}
      compact
      author={memberById.get(post.author_id)}
      likeCount={(likes.data ?? []).length}
      likedByMe={(likes.data ?? []).some((l) => l.user_id === userId)}
      commentCount={comments.data?.length ?? 0}
      onLike={(id) => void toggle.mutateAsync(id)}
    />
  )
}

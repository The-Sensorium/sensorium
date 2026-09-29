import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Link, router, type Href } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, MailOpen, PartyPopper, Sparkles } from 'lucide-react-native'
import { useAuth } from '../../src/auth-context'
import { useProfile } from '../../src/lib/use-profile'
import { usePullToRefresh } from '../../src/lib/use-pull-to-refresh'
import { useClusterMembers, useMyClusters, useLatestClusterFormed } from '../../src/features/matching'
import { useCluster } from '../../src/features/introductions'
import {
  useRecentClusterPosts,
  usePostLikesForPosts,
  usePostCommentsForPosts,
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
import { Card, ErrorText, LoadingView, PrimaryButton, Screen } from '../../src/components/ui'
import { Modal } from '../../src/components/Modal'
import { PushPermissionPrompt } from '../../src/components/PushPermissionPrompt'
import { MemberClusterCard } from '../../src/components/ClusterCard'
import { useUnreadChatCounts } from '../../src/features/notifications'
import { MutedHideBar, MutedPlaceholder } from '../../src/components/MutedPlaceholder'
import { PostCard } from '../../src/components/PostCard'
import { isMutedAuthor, mutedIds, toggleRevealedId, useMyMutes } from '../../src/features/moderation'

function daypartGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 23) return 'Good evening'
  return 'Good night'
}

const GET_STARTED_STEPS: { to: Href; title: string; desc: string }[] = [
  {
    to: '/(app)/settings/profile',
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
  const formedMembers = useClusterMembers(
    formed.data?.cluster_id ?? null,
    formed.data?.cluster_id != null,
  )
  const formedCluster = useCluster(
    formed.data?.cluster_id ?? null,
    formed.data?.cluster_id != null,
  )
  const formedCount = formedMembers.data?.length
  // Dynamic copy only for user-created activations; queue clusters keep the
  // established copy even if membership later dips below 8. While either the
  // roster or the cluster row is still loading (origin unknown), show a
  // neutral line instead of flashing the queue copy.
  const formedCopy =
    formedCluster.data?.origin === 'queue'
      ? 'Eight of you were matched. Jump in and say hello.'
      : formedCount == null
        ? 'Your cluster is active. Jump in and say hello.'
        : formedCount >= 8
          ? 'Eight of you were matched. Jump in and say hello.'
          : `${formedCount} of you are in. Jump in and say hello.`
  const invitations = useMyPendingInvitations()
  const acceptInvite = useAcceptInvitation()
  const declineInvite = useDeclineInvitation()
  const [confirmDeclineId, setConfirmDeclineId] = useState<string | null>(null)
  const confirmDecline = (invitations.data ?? []).find((i) => i.id === confirmDeclineId) ?? null
  const queryClient = useQueryClient()
  const clusterIds = useMemo(() => (clusters.data ?? []).map((c) => c.cluster.id), [clusters.data])
  const unread = useUnreadChatCounts(clusterIds.length > 0)
  const unreadByCluster = unread.data ?? new Map<string, number>()
  const pull = usePullToRefresh([
    () => clusters.refetch(),
    () => invitations.refetch(),
    () => formed.refetch(),
    () => unread.refetch(),
    () => queryClient.refetchQueries({ queryKey: ['recent-posts'] }),
    () => queryClient.refetchQueries({ queryKey: ['my-mutes'] }),
    () => queryClient.refetchQueries({ queryKey: ['post-likes'] }),
    () => queryClient.refetchQueries({ queryKey: ['post-comments'] }),
    () => queryClient.refetchQueries({ queryKey: ['cluster-members'] }),
  ])

  useEffect(() => {
    if (
      auth.state === 'signedIn' &&
      !profile.isLoading &&
      !profile.data?.onboarding_completed_at
    ) {
      router.replace('/(onboarding)')
    }
  }, [auth.state, profile.isLoading, profile.data])

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
    <Screen onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      <Text style={{ fontSize: 24, lineHeight: 30, letterSpacing: -0.2, fontWeight: '600', color: t.onSurface }} accessibilityRole="header">
        {firstName ? `Welcome, ${firstName}` : 'Home'}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 17, lineHeight: 22, color: t.onSurfaceVariant, marginBottom: 24 }}>
        {daypartGreeting()}
      </Text>
      <ErrorText message={pull.error} />

      <PushPermissionPrompt compact />
      {(invitations.data ?? []).map((inv) => (
        <Card key={inv.id}>
          <View style={{ marginBottom: 12 }}>
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
                {inv.origin === 'created' ? (
                  <Text style={{ fontSize: 14, color: t.onSurfaceVariant }} numberOfLines={1}>
                    Cluster name:{' '}
                    <Text style={{ fontWeight: '600', color: t.onSurface }}>
                      {inv.cluster_name}
                    </Text>
                  </Text>
                ) : (
                  <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
                    {inv.cluster_name} · {inv.mode_label}
                  </Text>
                )}
                {inv.origin === 'created' && inv.inviter_name ? (
                  <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
                    Created by {inv.inviter_name}
                  </Text>
                ) : null}
              </View>
            </View>
            {inviteError ? (
              <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{inviteError}</Text>
            ) : null}
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Accept"
                  loading={acceptInvite.isPending}
                  onPress={() => void acceptInvite.mutateAsync(inv.id).catch(() => {})}
                />
              </View>
              <Pressable
                disabled={acceptInvite.isPending || declineInvite.isPending}
                onPress={() => {
                  // Created invites are final once declined, so confirm first.
                  // Replacement invites keep the existing one-tap decline.
                  if (inv.origin === 'created') {
                    setConfirmDeclineId(inv.id)
                  } else {
                    void declineInvite.mutateAsync(inv.id).catch(() => {})
                  }
                }}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: t.outlineVariant,
                  borderRadius: radii.pill,
                  paddingHorizontal: 24,
                  paddingVertical: 16,
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: acceptInvite.isPending || declineInvite.isPending ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onSurface }}>Decline</Text>
              </Pressable>
            </View>
            {inv.origin === 'created' ? (
              <Link
                href={{ pathname: '/invites/[invitationId]', params: { invitationId: inv.id } }}
                asChild
              >
                <Pressable
                  hitSlop={8}
                  style={{ marginTop: 8, paddingVertical: 8, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: t.primary }}>
                    View invitation details
                  </Text>
                </Pressable>
              </Link>
            ) : null}
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
                {formedCopy}
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
            You’ll be matched into clusters of 8 strangers. Here’s how to get started.
          </Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {GET_STARTED_STEPS.map((step, i) => (
              <Link key={step.title} href={step.to} asChild>
                <Pressable
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: t.surface,
                    borderRadius: radii.md,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
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
                <Pressable hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 12, minHeight: 44 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
                    View all clusters
                  </Text>
                  <ArrowRight size={16} color={t.primary} />
                </Pressable>
              </Link>
            </View>
            {(clusters.data ?? []).map((item) => (
              <MemberClusterCard
                key={item.cluster.id}
                item={item}
                unreadCount={unreadByCluster.get(item.cluster.id) ?? 0}
              />
            ))}
            <RecentFromClusters clusterIds={clusterIds} clusterNameById={clusterNameById} />
          </View>
        )
      )}
      <Modal
        open={confirmDecline !== null}
        onClose={() => setConfirmDeclineId(null)}
        title="Decline invitation?"
      >
        <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
          {confirmDecline
            ? `You won’t be invited to ${confirmDecline.cluster_name} again. You can still be invited to other clusters.`
            : null}
        </Text>
        {declineInvite.error ? (
          <Text
            accessibilityRole="alert"
            style={{ marginTop: 12, fontSize: 14, lineHeight: 20, color: t.error }}
          >
            {toErrorMessage(declineInvite.error, 'Could not decline the invitation. Please try again.')}
          </Text>
        ) : null}
        <View style={{ marginTop: 20, flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Pressable
              onPress={() => setConfirmDeclineId(null)}
              accessibilityRole="button"
              style={{
                borderWidth: 1,
                borderColor: t.outlineVariant,
                borderRadius: radii.pill,
                paddingHorizontal: 24,
                paddingVertical: 16,
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onSurface }}>
                Keep invitation
              </Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              title="Decline"
              loadingTitle="Declining…"
              loading={declineInvite.isPending}
              onPress={() => {
                if (!confirmDecline) return
                void declineInvite
                  .mutateAsync(confirmDecline.id)
                  .then(() => setConfirmDeclineId(null))
                  .catch(() => {
                    // Surfaced via declineInvite.error inside the dialog; stay open to retry.
                  })
              }}
            />
          </View>
        </View>
      </Modal>
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
  const auth = useAuth()
  const selfId = auth.state === 'signedIn' ? auth.userId : null
  const recent = useRecentClusterPosts(clusterIds, 3)
  const myMutes = useMyMutes(clusterIds.length > 0)
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const recentPostIds = useMemo(
    () => [...new Set((recent.data ?? []).map((p) => p.id))],
    [recent.data],
  )
  const postLikes = usePostLikesForPosts(recentPostIds)
  const postComments = usePostCommentsForPosts(recentPostIds)
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
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  function toggleReveal(id: string) {
    setRevealed((prev) => toggleRevealedId(prev, id))
  }

  return (
    <View style={{ marginTop: 24 }}>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}
      >
        <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface }}>
          Recent posts
        </Text>
        <Link href="/(app)/posts" asChild>
          <Pressable hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 12, minHeight: 44 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
              View all posts
            </Text>
            <ArrowRight size={16} color={t.primary} />
          </Pressable>
        </Link>
      </View>
      {recent.isLoading || myMutes.isLoading ? (
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
            muted={isMutedAuthor(mutedSet, post.author_id)}
            revealed={revealed.has(post.id)}
            onToggleMute={() => toggleReveal(post.id)}
            likeCount={likesByPost.get(post.id)?.count ?? 0}
            likedByMe={likesByPost.get(post.id)?.mine ?? false}
            commentCount={commentsByPost.get(post.id) ?? 0}
          />
        ))
      )}
    </View>
  )
}

function RecentPostItem({
  post,
  clusterName,
  muted,
  revealed,
  onToggleMute,
  likeCount,
  likedByMe,
  commentCount,
}: {
  post: Post
  clusterName: string | undefined
  muted: boolean
  revealed: boolean
  onToggleMute: () => void
  likeCount: number
  likedByMe: boolean
  commentCount: number
}) {
  const members = useClusterMembers(post.cluster_id)

  const memberById = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m])),
    [members.data],
  )
  const author = memberById.get(post.author_id)
  const authorName = author?.display_name ?? 'Member'

  if (muted && !revealed) {
    return (
      <MutedPlaceholder name={authorName} onToggle={onToggleMute} kind="post" />
    )
  }

  return (
    <View style={{ gap: 8 }}>
      {muted ? (
        <MutedHideBar name={authorName} onToggle={onToggleMute} kind="post" />
      ) : null}
      <RecentPostEngagement
        post={post}
        clusterName={clusterName}
        author={author}
        likeCount={likeCount}
        likedByMe={likedByMe}
        commentCount={commentCount}
      />
    </View>
  )
}

function RecentPostEngagement({
  post,
  clusterName,
  author,
  likeCount,
  likedByMe,
  commentCount,
}: {
  post: Post
  clusterName: string | undefined
  author: { id: string; display_name: string; avatar_url: string | null } | undefined
  likeCount: number
  likedByMe: boolean
  commentCount: number
}) {
  const toggle = useTogglePostLike(post.cluster_id)

  return (
    <PostCard
      post={post}
      clusterId={post.cluster_id}
      clusterName={clusterName}
      compact
      author={author}
      likeCount={likeCount}
      likedByMe={likedByMe}
      commentCount={commentCount}
      onLike={(id) => void toggle.mutateAsync(id)}
    />
  )
}

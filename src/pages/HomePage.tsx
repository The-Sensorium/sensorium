import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertTriangle, ArrowRight, Loader2, MailOpen, PartyPopper, Sparkles } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { useProfile } from '../lib/use-profile'
import { useAuth } from '../app/auth-context'
import {
  useMyClusters,
  useClusterMembers,
  useLatestClusterFormed,
  type MyCluster,
} from '../features/matching'
import {
  useMyPendingInvitations,
  useAcceptInvitation,
  useDeclineInvitation,
} from '../features/votes'
import {
  useRecentClusterPosts,
  usePostLikes,
  usePostComments,
  useTogglePostLike,
  type Post,
} from '../features/posts'
import { ClusterCard } from '../components/ClusterCard'
import { PostCard } from '../components/PostCard'
import { toErrorMessage } from '../lib/error'

const GET_STARTED_STEPS = [
  {
    to: '/settings',
    title: 'Set up your profile',
    desc: 'Add a photo, bio and status so your cluster knows who you are.',
  },
  {
    to: '/discovery/local',
    title: 'Set your local area',
    desc: 'Pick a radius and you’ll be matched with people nearby.',
  },
  {
    to: '/clusters',
    title: 'Join a queue',
    desc: 'Choose a matching mode. Clusters form when 8 people match.',
  },
] as const

export function HomePage() {
  useDocumentTitle('Home')
  const profile = useProfile()
  const navigate = useNavigate()
  const clusters = useMyClusters()
  const formed = useLatestClusterFormed()
  const invitations = useMyPendingInvitations()
  const acceptInvite = useAcceptInvitation()
  const declineInvite = useDeclineInvitation()

  const firstName = profile.data?.display_name?.split(' ')[0]
  const inviteError =
    toErrorMessage(acceptInvite.error, '') ||
    toErrorMessage(declineInvite.error, '') ||
    null

  const clusterIds = useMemo(() => (clusters.data ?? []).map((c) => c.cluster.id), [clusters.data])
  const clusterNameById = useMemo(
    () => new Map((clusters.data ?? []).map((c) => [c.cluster.id, c.cluster.name])),
    [clusters.data],
  )

  const loading = clusters.isLoading || invitations.isLoading
  const hasClusters = (clusters.data?.length ?? 0) > 0
  const hasInvites = (invitations.data?.length ?? 0) > 0
  const isFresh = !loading && !hasClusters && !hasInvites && !formed.data
  const listError =
    (clusters.isError ? 'Couldn’t load your clusters.' : '') ||
    (invitations.isError ? 'Couldn’t load your invitations.' : '')

  return (
    <div className="space-y-8">
      <header className="pt-2">
        <h1 className="font-display text-3xl font-semibold text-on-surface">
          {firstName ? `Welcome, ${firstName}` : 'Home'}
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Eight strangers. One cluster.
        </p>
      </header>

      {(invitations.data ?? []).map((inv) => (
        <div
          key={inv.id}
          className="rounded-2xl border border-primary/30 bg-primary-container/15 p-5 shadow-soft"
        >
          <div className="flex items-center gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-on-primary">
              <MailOpen className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold text-on-surface">
                You’re invited to join a cluster
              </p>
              <p className="text-sm text-on-surface-variant">
                {inv.cluster_name} · {inv.mode_label}
              </p>
            </div>
          </div>
          {inviteError && (
            <p role="alert" className="mt-3 rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
              {inviteError}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={acceptInvite.isPending || declineInvite.isPending}
              onClick={() => acceptInvite.mutateAsync(inv.id).catch(() => {})}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
            >
              {acceptInvite.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                'Accept'
              )}
            </button>
            <button
              type="button"
              disabled={acceptInvite.isPending || declineInvite.isPending}
              onClick={() => declineInvite.mutateAsync(inv.id).catch(() => {})}
              className="inline-flex flex-1 items-center justify-center rounded-pill border border-outline-variant/60 px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
            >
              Decline
            </button>
          </div>
        </div>
      ))}

      {listError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          <span>{listError} Please try again.</span>
        </div>
      )}

      {formed.data && (
        <button
          type="button"
          onClick={() => navigate('/cluster-created')}
          className="flex w-full items-center gap-4 rounded-2xl border border-primary/30 bg-primary-container/15 p-5 text-left shadow-soft transition-colors hover:bg-primary-container/25"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-on-primary">
            <PartyPopper className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-semibold text-on-surface">
              Your cluster is ready
            </span>
            <span className="block text-sm text-on-surface-variant">
              Eight of you were matched. Start your introductions.
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        </button>
      )}

      {isFresh ? (
        <GetStarted />
      ) : (
        <>
          {hasClusters && <YourClusters clusters={clusters.data ?? []} />}
          {hasClusters && (
            <RecentFromClusters clusterIds={clusterIds} clusterNameById={clusterNameById} />
          )}
        </>
      )}
    </div>
  )
}

function GetStarted() {
  return (
    <section aria-label="Get started" className="rounded-2xl border border-primary/30 bg-primary-container/10 p-6 shadow-soft">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.5} aria-hidden />
        <h2 className="font-display text-xl font-semibold text-on-surface">Welcome to Sensorium</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-on-surface-variant">
        You’re matched into clusters of 8 strangers. Here’s how to get started.
      </p>
      <ol className="mt-5 space-y-3">
        {GET_STARTED_STEPS.map((step, i) => (
          <li key={step.title}>
            <Link
              to={step.to}
              className="flex items-center gap-3 rounded-xl border border-outline-variant/60 bg-surface p-4 transition-colors hover:bg-surface-container"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-on-primary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-on-surface">{step.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{step.desc}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

function YourClusters({ clusters }: { clusters: MyCluster[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-on-surface">Your clusters</h2>
        <Link
          to="/clusters"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          View all clusters <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {clusters.map((item) => (
          <ClusterCard key={item.cluster.id} item={item} />
        ))}
      </div>
    </section>
  )
}

function RecentFromClusters({
  clusterIds,
  clusterNameById,
}: {
  clusterIds: string[]
  clusterNameById: Map<string, string>
}) {
  const recent = useRecentClusterPosts(clusterIds, 3)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-on-surface">Recent posts</h2>
        <Link
          to="/posts"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          View all posts <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      {recent.isLoading ? (
        <LoadingRow />
      ) : recent.isError ? (
        <div
          role="alert"
          className="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
        >
          Couldn’t load recent posts. Please try again.
        </div>
      ) : (recent.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center">
          <p className="text-sm text-on-surface-variant">
            No posts in your clusters yet. Be the first to share something.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(recent.data ?? []).map((post) => (
            <RecentPostItem
              key={post.id}
              post={post}
              clusterName={clusterNameById.get(post.cluster_id)}
            />
          ))}
        </div>
      )}
    </section>
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

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-sm text-on-surface-variant">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Loading…
    </div>
  )
}

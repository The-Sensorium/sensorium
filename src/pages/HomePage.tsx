import { Link, useNavigate } from 'react-router'
import { AlertTriangle, ArrowRight, Compass, Loader2, MailOpen, PartyPopper, Sparkles } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { useProfile } from '../lib/use-profile'
import {
  useMyClusters,
  useMyQueueKeys,
  useLatestClusterFormed,
  type MyCluster,
} from '../features/matching'
import {
  useMyPendingInvitations,
  useAcceptInvitation,
  useDeclineInvitation,
} from '../features/votes'
import { QueueCard } from '../components/QueueCard'
import { ClusterCard } from '../components/ClusterCard'

const GET_STARTED_STEPS = [
  {
    to: '/settings',
    title: 'Set up your profile',
    desc: 'Add a photo, bio and status so your cluster knows who you are.',
  },
  {
    to: '/discovery?mode=local',
    title: 'Set your local area',
    desc: 'Pick a radius and you’ll be matched with people nearby.',
  },
  {
    to: '/discovery',
    title: 'Join a queue',
    desc: 'Choose a matching mode. Clusters form when 8 people match.',
  },
] as const

export function HomePage() {
  useDocumentTitle('Home')
  const profile = useProfile()
  const navigate = useNavigate()
  const clusters = useMyClusters()
  const queues = useMyQueueKeys()
  const formed = useLatestClusterFormed()
  const invitations = useMyPendingInvitations()
  const acceptInvite = useAcceptInvitation()
  const declineInvite = useDeclineInvitation()

  const firstName = profile.data?.display_name?.split(' ')[0]
  const inviteError =
    (acceptInvite.error as Error | null)?.message ?? (declineInvite.error as Error | null)?.message ?? null

  const loading = clusters.isLoading || queues.isLoading || invitations.isLoading
  const hasClusters = (clusters.data?.length ?? 0) > 0
  const hasQueues = (queues.data?.length ?? 0) > 0
  const hasInvites = (invitations.data?.length ?? 0) > 0
  const isFresh = !loading && !hasClusters && !hasQueues && !hasInvites && !formed.data
  const listError =
    (clusters.isError ? 'Couldn’t load your clusters.' : '') ||
    (queues.isError ? 'Couldn’t load your queues.' : '') ||
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
          {hasClusters && <JumpBackIn clusters={clusters.data ?? []} />}

          <section className="space-y-4">
            <h2 className="font-display text-xl font-semibold text-on-surface">Queued</h2>
            {queues.isLoading ? (
              <LoadingRow />
            ) : queues.data && queues.data.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {queues.data.map((entry) => (
                  <QueueCard key={entry.mode} entry={entry} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center">
                <Compass className="mx-auto h-6 w-6 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
                <p className="mt-3 text-sm text-on-surface-variant">
                  You’re not waiting in any queue right now.
                </p>
                <Link
                  to="/discovery"
                  className="mt-4 inline-flex items-center gap-2 rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
                >
                  Browse matching modes <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            )}
          </section>
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

function JumpBackIn({ clusters }: { clusters: MyCluster[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-on-surface">Jump back in</h2>
        <Link
          to="/clusters"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          View all clusters <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {clusters.slice(0, 2).map((item) => (
          <ClusterCard key={item.cluster.id} item={item} />
        ))}
      </div>
    </section>
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

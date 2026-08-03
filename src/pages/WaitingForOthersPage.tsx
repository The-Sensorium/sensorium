import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router'
import { CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import {
  useCluster,
  useMyMembership,
  useIntroProgress,
} from '../features/introductions'
import { CountdownTimer } from '../components/CountdownTimer'

const CLUSTER_SIZE = 8

export function WaitingForOthersPage() {
  useDocumentTitle('Waiting for Others')
  const { clusterId = '' } = useParams()
  const cluster = useCluster(clusterId)
  const membership = useMyMembership(clusterId)
  const progress = useIntroProgress(clusterId, clusterId !== '')

  const rows = progress.data ?? []
  const done = rows.filter((r) => r.intro_completed_at).length
  const allDone = rows.length > 0 && done === rows.length

  // Everyone finished but this client's cluster row may still read "locked" (the 8th
  // submit unlocks the cluster, and our cached row can lag it). Poll the cluster row
  // instead of bouncing to /cluster and back - that round-trip would redirect-loop.
  useEffect(() => {
    if (!allDone || cluster.data?.introductions_completed_at) return
    const t = setInterval(() => void cluster.refetch(), 3000)
    return () => clearInterval(t)
  }, [allDone, cluster.data?.introductions_completed_at, cluster])

  if (cluster.isLoading || membership.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    )
  }

  if (!cluster.data) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-10 text-center text-sm text-on-surface-variant">
        This cluster isn’t available to you.
      </div>
    )
  }

  if (cluster.data.introductions_completed_at) {
    return <Navigate to={`/cluster/${clusterId}`} replace />
  }

  if (!membership.data?.intro_completed_at) {
    return <Navigate to={`/cluster/${clusterId}/introductions`} replace />
  }

  const deadline = cluster.data.introductions_deadline
  const pct = Math.round((done / CLUSTER_SIZE) * 100)

  return (
    <div className="mx-auto max-w-xl space-y-6 pt-2">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Introductions · {cluster.data.name}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-on-surface">
          {allDone ? 'All introductions complete' : 'Waiting for the others'}
        </h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          {allDone
            ? 'Everyone has answered. Your cluster is unlocking. Chat is about to open.'
            : `${done} of ${CLUSTER_SIZE} introductions completed. Chat unlocks when everyone answers.`}
          {deadline ? (
            <span className="mt-1 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              Deadline: <CountdownTimer deadline={deadline} className="font-semibold" />
            </span>
          ) : null}
        </p>
      </header>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-on-surface-variant">{done} of {CLUSTER_SIZE} completed</span>
          <span className="font-semibold text-on-surface">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-pill bg-surface-container-highest">
          <div
            className="h-full rounded-pill bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {progress.isLoading && rows.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading progress…
        </div>
      ) : (
        <ul aria-label="Intro progress" className="divide-y divide-outline-variant/60 rounded-2xl border border-outline-variant/60 bg-surface shadow-soft">
          {rows.map((row) => {
            const isDone = !!row.intro_completed_at
            return (
              <li key={row.user_id} className="flex items-center gap-3 px-5 py-3.5">
                <span
                  aria-label={isDone ? 'Completed' : 'Not completed'}
                  className={cnBadge(isDone)}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" strokeWidth={1.5} aria-hidden />
                  ) : (
                    <Clock className="h-5 w-5 text-on-surface-variant/50" strokeWidth={1.5} aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-on-surface">{row.display_name}</span>
                  <span className="block text-xs text-on-surface-variant">
                    {isDone ? 'Completed' : 'Still writing'}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-xs leading-5 text-on-surface-variant">
        This page updates automatically. If someone leaves before finishing, the cluster re-fills
        from the queue and the deadline extends.
      </p>
    </div>
  )
}

function cnBadge(isDone: boolean): string {
  return `grid h-10 w-10 shrink-0 place-items-center rounded-full ${
    isDone ? 'bg-primary-container/20' : 'bg-surface-container'
  }`
}

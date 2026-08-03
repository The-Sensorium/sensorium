import { Link } from 'react-router'
import { Loader2, MessageSquare, Scale } from 'lucide-react'
import { useClusterSignals, useSignalReplies } from '../features/signals'
import { useClusterVotes } from '../features/votes'
import { CountdownTimer } from './CountdownTimer'
import type { Signal } from '../features/signals'
import type { Vote } from '../features/votes'
import { cn } from '../lib/utils'

const VOTE_TYPE_LABEL: Record<Vote['type'], string> = {
  replace_member: 'Replace a member',
  change_name: 'Rename the cluster',
  select_candidate: 'Choose a new member',
}

const SIGNAL_STATUS: Record<Signal['status'], { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-primary/10 text-primary' },
  in_progress: { label: 'In progress', className: 'bg-tertiary-container/25 text-tertiary' },
  resolved: { label: 'Resolved', className: 'bg-surface-container text-on-surface-variant' },
}

function RailCard({
  title,
  count,
  to,
  children,
}: {
  title: string
  count?: number
  to: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft">
      <Link
        to={to}
        className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <span>{title}</span>
        {count !== undefined && (
          <span className="rounded-pill bg-surface-container px-2 py-0.5 text-xs tabular-nums">
            {count}
          </span>
        )}
      </Link>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

export function ClusterRail({
  clusterId,
  stickyTop = 'top-40',
}: {
  clusterId: string
  stickyTop?: string
}) {
  const signals = useClusterSignals(clusterId)
  const replies = useSignalReplies(clusterId, null)
  const votes = useClusterVotes(clusterId)

  const replyCount = new Map<string, number>()
  for (const r of replies.data ?? []) {
    replyCount.set(r.signal_id, (replyCount.get(r.signal_id) ?? 0) + 1)
  }

  const activeSignals = (signals.data ?? []).filter((s) => s.status !== 'resolved').slice(0, 3)
  const openVotes = (votes.data ?? []).filter((v) => v.status === 'open').slice(0, 3)

  return (
    <div className={cn('sticky space-y-4', stickyTop)}>
      <RailCard title="Signals" count={activeSignals.length} to={`/cluster/${clusterId}/signals`}>
        {signals.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : activeSignals.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No open signals.</p>
        ) : (
          <ul className="space-y-2.5">
            {activeSignals.map((s) => {
              const meta = SIGNAL_STATUS[s.status]
              return (
                <li key={s.id}>
                  <Link
                    to={`/cluster/${clusterId}/signals/${s.id}`}
                    className="block rounded-xl border border-outline-variant/50 bg-surface-low px-3 py-2.5 transition-colors hover:border-outline/60"
                  >
                    <p className="line-clamp-2 text-sm text-on-surface">{s.prompt}</p>
                    <p className="mt-1.5 flex items-center gap-2 text-xs text-on-surface-variant">
                      <span className={cn('rounded-pill px-2 py-0.5 font-medium', meta.className)}>
                        {meta.label}
                      </span>
                      {(replyCount.get(s.id) ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" strokeWidth={1.5} aria-hidden />
                          {replyCount.get(s.id)}
                        </span>
                      )}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </RailCard>

      <RailCard title="Open votes" count={openVotes.length} to={`/cluster/${clusterId}/votes`}>
        {votes.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : openVotes.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Scale className="h-4 w-4" strokeWidth={1.5} aria-hidden /> No open votes right now.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {openVotes.map((v) => (
              <li key={v.id}>
                <Link
                  to={`/cluster/${clusterId}/votes`}
                  className="block rounded-xl border border-outline-variant/50 bg-surface-low px-3 py-2.5 transition-colors hover:border-outline/60"
                >
                  <p className="truncate text-sm text-on-surface">{VOTE_TYPE_LABEL[v.type]}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Ends in <CountdownTimer deadline={v.closes_at} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </RailCard>
    </div>
  )
}

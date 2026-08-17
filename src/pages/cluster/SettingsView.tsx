import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { CalendarDays, Compass, Loader2, LogOut, Tag, Users } from 'lucide-react'
import { useCluster } from '../../features/introductions'
import { useClusterMembers } from '../../features/matching'
import { useLeaveCluster } from '../../features/cluster'
import { modeInfo } from '../../lib/modes'
import { toErrorMessage } from '../../lib/error'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function SettingsView() {
  useDocumentTitle('Cluster Settings')
  const { clusterId = '' } = useParams()
  const navigate = useNavigate()
  const cluster = useCluster(clusterId)
  const members = useClusterMembers(clusterId)
  const leave = useLeaveCluster()
  const [confirming, setConfirming] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const MatchedByIcon = cluster.data ? modeInfo(cluster.data.matching_mode).icon : Compass

  async function handleLeave() {
    if (!clusterId) return
    setLeaveError(null)
    try {
      await leave.mutateAsync(clusterId)
      navigate('/home')
    } catch (err) {
      setLeaveError(toErrorMessage(err, 'Could not leave the cluster. Please try again.'))
      setConfirming(false)
    }
  }

  return (
    <section aria-label="Cluster settings" className="space-y-4">
      <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <h2 className="font-display text-lg font-semibold text-on-surface">Cluster details</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-on-surface-variant">
              <Tag className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              Name
            </dt>
            <dd className="truncate text-right font-medium text-on-surface">{cluster.data?.name ?? '–'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-on-surface-variant">
              <MatchedByIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              Matched by
            </dt>
            <dd className="text-right font-medium text-on-surface">
              {cluster.data ? modeInfo(cluster.data.matching_mode).label : '–'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-on-surface-variant">
              <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              Members
            </dt>
            <dd className="text-right font-medium text-on-surface">
              <span className="inline-flex items-center rounded-pill bg-surface-container px-2.5 py-1 text-xs font-semibold">
                {(members.data ?? []).length} / 8
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-on-surface-variant">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              Formed
            </dt>
            <dd className="text-right font-medium text-on-surface">
              {cluster.data ? dateFormatter.format(new Date(cluster.data.created_at)) : '–'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-error-container/40 text-on-error-container">
            <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </span>
          <h2 className="font-display text-lg font-semibold text-on-surface">Leave cluster</h2>
        </div>
        <p className="mt-2 text-sm text-on-surface-variant">
          Leaving starts a 30-day cooldown for this matching mode and triggers a replacement search so
          the cluster can stay at 8.
        </p>
        {confirming ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleLeave()}
              disabled={leave.isPending}
              className="inline-flex items-center gap-2 rounded-pill bg-error px-5 py-2.5 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-60"
            >
              {leave.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Confirm leave
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-pill px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-pill border border-error/40 px-5 py-2.5 text-sm font-semibold text-error transition-colors hover:bg-error/5"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Leave cluster
          </button>
        )}
        {leaveError && (
          <p role="alert" className="mt-3 text-sm text-error">{leaveError}</p>
        )}
      </div>
    </section>
  )
}

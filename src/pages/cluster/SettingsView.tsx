import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { CalendarDays, Compass, Loader2, LogOut, Tag, Users } from 'lucide-react'
import { useCluster } from '../../features/introductions'
import { useClusterMembers } from '../../features/matching'
import { useLeaveCluster } from '../../features/cluster'
import { Modal } from '../../components/Modal'
import { modeInfo, cooldownDaysForMode } from '../../lib/modes'
import { CLUSTER_SIZE } from '../../lib/constants'
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
  const created = cluster.data?.origin === 'created'

  async function handleLeave() {
    if (!clusterId) return
    setLeaveError(null)
    try {
      await leave.mutateAsync(clusterId)
      setConfirming(false)
      navigate('/home')
    } catch (err) {
      setLeaveError(toErrorMessage(err, 'Could not leave the cluster. Please try again.'))
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
            <dd className="truncate text-right font-medium text-on-surface">{cluster.data?.name ?? '-'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-on-surface-variant">
              <MatchedByIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              Matched by
            </dt>
            <dd className="text-right font-medium text-on-surface">
              {cluster.data ? (created ? 'Created cluster' : modeInfo(cluster.data.matching_mode).label) : '-'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-on-surface-variant">
              <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              Members
            </dt>
            <dd className="text-right font-medium text-on-surface">
              <span className="inline-flex items-center rounded-pill bg-surface-container px-2.5 py-1 text-xs font-semibold">
                {(members.data ?? []).length} / {CLUSTER_SIZE}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-on-surface-variant">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              Formed
            </dt>
            <dd className="text-right font-medium text-on-surface">
              {cluster.data ? dateFormatter.format(new Date(cluster.data.created_at)) : '-'}
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
          {created ? (
            <>Leaving a created cluster frees your spot right away. There is no cooldown.</>
          ) : (
            <>
              Leaving starts a {cluster.data ? cooldownDaysForMode(cluster.data.matching_mode) : 7}-day
              cooldown for this matching mode and triggers a replacement search so the cluster can stay
              at 8.
            </>
          )}
        </p>
        {confirming ? null : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-error/40 px-5 py-2.5 text-sm font-semibold text-error transition-colors hover:bg-error/5"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Leave cluster
          </button>
        )}
      </div>
      <Modal open={confirming} onClose={() => { if (!leave.isPending) setConfirming(false) }} title="Leave cluster?">
        <p className="mt-4 text-sm leading-6 text-on-surface-variant">
          {created ? (
            <>Leaving frees your spot right away. There is no cooldown.</>
          ) : (
            <>
              Leaving starts a {cluster.data ? cooldownDaysForMode(cluster.data.matching_mode) : 7}-day
              cooldown for this matching mode and triggers a replacement search so the cluster can stay
              at 8.
            </>
          )}
        </p>
        {leaveError && (
          <p role="alert" className="mt-4 text-sm text-error">{leaveError}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={leave.isPending}
            className="inline-flex min-h-[44px] items-center rounded-pill px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleLeave()}
            disabled={leave.isPending}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-pill bg-error px-5 py-3 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {leave.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Leave cluster
          </button>
        </div>
      </Modal>
    </section>
  )
}

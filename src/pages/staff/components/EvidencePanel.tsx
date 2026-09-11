import { Loader2 } from 'lucide-react'
import {
  targetSummary,
  type ModeratedMessageRow,
  type ModerationCaseV2Row,
} from '../../../features/admin-moderation'

export function EvidencePanel({
  data,
  msg,
  canAct,
  busy,
  hidePending,
  restorePending,
  onHide,
  onRestore,
}: {
  data: ModerationCaseV2Row
  msg: ModeratedMessageRow | null
  canAct: boolean
  busy: boolean
  hidePending: boolean
  restorePending: boolean
  onHide: () => void
  onRestore: () => void
}) {
  const target = targetSummary(data)

  return (
    <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
      <h2 className="text-sm font-semibold text-on-surface">Reported content</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Reason</dt>
          <dd className="font-medium capitalize text-on-surface">{data.reason.replace(/_/g, ' ')}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Target</dt>
          <dd className="font-medium text-on-surface">{target.display_name ?? 'Unknown member'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Cluster</dt>
          <dd className="font-medium text-on-surface">{data.cluster_name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-on-surface-variant">Prior reports</dt>
          <dd className="font-medium text-on-surface">{data.prior_reports} prior</dd>
        </div>
        {data.details ? (
          <p className="mt-2 rounded-xl bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">{data.details}</p>
        ) : null}
      </dl>

      {msg ? (
        <div className="mt-4 border-t border-outline-variant/50 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-on-surface">Reported message</h3>
            <span className="rounded-pill bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
              {msg.content ? 'private chat message' : 'media attachment'}
            </span>
          </div>
          {msg.content && <p className="mt-3 rounded-xl bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">{msg.content}</p>}
          {canAct ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onHide}
                disabled={busy || hidePending}
                className="inline-flex items-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                {hidePending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Hide message
              </button>
              <button
                type="button"
                onClick={onRestore}
                disabled={busy || restorePending}
                className="inline-flex items-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                {restorePending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Restore message
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

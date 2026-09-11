import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  MODERATION_SEVERITY_LABELS,
  REPORT_STATUS_LABELS,
  TARGET_KIND_LABELS,
  isBreached,
  targetSummary,
  type ModerationCaseV2Row,
  type ModerationSeverity,
  type TargetKind,
} from '../../../features/admin-moderation'
import { timeAgo, timeUntil } from '../../../features/notifications'

export function CaseHeader({
  onBack,
  data,
  claimedByMe,
  open,
  busy,
  claimPending,
  onClaim,
  onRelease,
  onDismiss,
}: {
  onBack: () => void
  data: ModerationCaseV2Row
  claimedByMe: boolean
  open: boolean
  busy: boolean
  claimPending: boolean
  onClaim: () => void
  onRelease: () => void
  onDismiss: () => void
}) {
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const breached = isBreached(data.due_at, data.status)

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-pill border border-outline-variant/60 text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </button>
          <div>
            <h1 className="font-display text-3xl font-semibold text-on-surface">Report case</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              {data.reason.replace(/_/g, ' ')} report about {targetSummary(data).display_name ?? 'Unknown member'}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span
            title="Case status: pending, reviewing, actioned, or dismissed."
            className="rounded-pill bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant"
          >
            Status: {REPORT_STATUS_LABELS[data.status]}
          </span>
          <span
            title="Triage severity, drives the SLA: urgent 4 hours, high 24 hours, medium 72 hours, low 7 days."
            className="rounded-pill bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant"
          >
            Severity: {MODERATION_SEVERITY_LABELS[(data.severity as ModerationSeverity) ?? 'medium']}
          </span>
          <span
            title="What was reported: a member, a chat message, a post, or a comment."
            className="rounded-pill bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant"
          >
            Target: {TARGET_KIND_LABELS[(data.target_kind as TargetKind) ?? 'member'] ?? data.target_kind}
          </span>
          {breached && (
            <span className="rounded-pill bg-error/10 px-3 py-1.5 text-xs font-semibold text-error">
              SLA breached
            </span>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-outline-variant/60 bg-outline-variant/60 sm:grid-cols-4">
        {[
          { label: 'Assignee', value: data.assigned_to_display_name ?? 'Unassigned', wide: false },
          { label: 'Submitted', value: timeAgo(data.created_at), wide: false },
          { label: 'Last activity', value: timeAgo(data.last_activity_at), wide: false },
          ...(data.due_at ? [{ label: 'Due', value: timeUntil(data.due_at), wide: false }] : []),
          ...(data.escalated_at
            ? [{
              label: 'Escalated',
              value: `${timeAgo(data.escalated_at)}${data.escalation_reason ? ` — ${data.escalation_reason}` : ''}`,
              wide: true,
            }]
            : []),
        ].map((item) => (
          <div key={item.label} className={`bg-surface px-3 py-2 ${item.wide ? 'col-span-2 sm:col-span-4' : ''}`}>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{item.label}</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold text-on-surface" title={item.value}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {open && data.assigned_to && !claimedByMe && (
        <p role="alert" className="rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">
          This case is being reviewed by {data.assigned_to_display_name ?? 'another moderator'}. Your actions are
          limited until it is released or reassigned.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {claimedByMe && open ? (
          <button
            type="button"
            onClick={onRelease}
            disabled={busy}
            className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            Release case
          </button>
        ) : data.status === 'pending' && !data.assigned_to ? (
          <button
            type="button"
            onClick={onClaim}
            disabled={busy}
            className="rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {claimPending ? 'Claiming...' : 'Claim case'}
          </button>
        ) : null}
        {open && (claimedByMe || (data.status === 'pending' && !data.assigned_to)) && (
          <button
            type="button"
            onClick={() => setConfirmDismiss(true)}
            disabled={busy}
            className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            Dismiss report
          </button>
        )}
      </div>
      {confirmDismiss && open && (
        <div className="rounded-md border border-outline-variant/60 bg-surface-container/50 p-3">
          <p className="text-sm font-semibold text-on-surface">Dismiss this report?</p>
          <p className="mt-1 text-xs leading-5 text-on-surface-variant">The report will be closed without an account action.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDismiss(false)}
              className="rounded-pill px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmDismiss(false)
                onDismiss()
              }}
              disabled={busy}
              className="rounded-pill bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-40"
            >
              Confirm dismiss
            </button>
          </div>
        </div>
      )}
      {data.resolution_note ? (
        <p className="rounded-md bg-surface-container/60 p-3 text-sm leading-6 text-on-surface-variant">
          Resolution note: {data.resolution_note}
        </p>
      ) : null}
    </div>
  )
}

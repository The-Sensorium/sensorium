import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Ban, Loader2, ShieldAlert } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import {
  formatError,
  REPORT_STATUS_LABELS,
  useApplyRestriction,
  useClaimReport,
  useHideMessage,
  useIssueWarning,
  useModeratedMessage,
  useModerationReport,
  useReleaseReport,
  useResolveReport,
  useRestoreMessage,
} from '../../features/admin-moderation'
import { useMyAccess, type Capability } from '../../features/access'

function has(access: ReturnType<typeof useMyAccess>['data'], cap: Capability) {
  return access?.capabilities.includes(cap) ?? false
}

export function ModerationCasePage() {
  useDocumentTitle('Report case')
  const { reportId } = useParams<{ reportId: string }>()
  const report = useModerationReport(reportId)
  const messageQuery = useModeratedMessage(reportId)
  const access = useMyAccess()
  const data = report.data
  const msg = messageQuery.data

  const claim = useClaimReport()
  const release = useReleaseReport()
  const resolve = useResolveReport()
  const hideMessage = useHideMessage()
  const restoreMessage = useRestoreMessage()
  const warn = useIssueWarning()
  const restrict = useApplyRestriction()

  const [reason, setReason] = useState('')
  const [expiryDays, setExpiryDays] = useState(3)
  const [ban, setBan] = useState(false)
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (report.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  if (report.isError || !data) {
    return (
      <div className="rounded-2xl border border-error/30 bg-error/10 p-10 text-center">
        <p className="text-sm font-semibold text-error">Could not load this report.</p>
        <button
          type="button"
          onClick={() => void report.refetch()}
          className="mt-4 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          Try Again
        </button>
      </div>
    )
  }

  const claimedByMe = data.assigned_to === access.data?.user_id
  const isModerator = has(access.data, 'can_moderate')
  const isAdmin = has(access.data, 'can_apply_permanent_restriction')
  const open = data.status === 'pending' || data.status === 'reviewing'
  const accountBusy = claim.isPending || release.isPending || resolve.isPending || warn.isPending || restrict.isPending
  const maxExpiryDays = isAdmin ? 999 : 7
  const expiryValid = Number.isInteger(expiryDays) && expiryDays >= 1 && expiryDays <= maxExpiryDays

  async function run<A extends object>(mut: { mutateAsync: (args: A) => Promise<unknown> }, args: A) {
    setError(null)
    setSuccess(null)
    try {
      await mut.mutateAsync(args)
      setSuccess('Action completed successfully.')
      setConfirmDismiss(false)
      setConfirmSuspend(false)
    } catch (e) {
      setError(formatError(e))
    }
  }

  function actionArgs() {
    return reason.trim()
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-3">
          <Link to=".." className="grid h-9 w-9 place-items-center rounded-pill border border-outline-variant/60 text-on-surface-variant transition-colors hover:bg-surface-container">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </Link>
          <div>
            <h1 className="font-display text-3xl font-semibold text-on-surface">Report case</h1>
            <p className="mt-1 text-sm text-on-surface-variant">Reviewing a report about {data.target_display_name}.</p>
          </div>
        </div>
        <span className="rounded-pill bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
          {REPORT_STATUS_LABELS[data.status]} - submitted {new Date(data.created_at).toLocaleDateString()}
        </span>
      </header>

      {error && <p className="rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>}
      {success && <p role="status" className="rounded-2xl border border-primary/30 bg-primary-container/10 p-3 text-sm text-on-surface">{success}</p>}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-on-surface">Reported content</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Reason</dt>
              <dd className="font-medium capitalize text-on-surface">{data.reason.replace(/_/g, ' ')}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Target</dt>
              <dd className="font-medium text-on-surface">{data.target_display_name}</dd>
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
        </div>

        <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-on-surface">Workflow</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {claimedByMe && open ? (
              <button
                type="button"
                onClick={() => void run(release, { p_report_id: data.id })}
                disabled={accountBusy}
                className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                Release case
              </button>
            ) : data.status === 'pending' && !data.assigned_to ? (
              <button
                type="button"
                onClick={() => void run(claim, { p_report_id: data.id })}
                disabled={accountBusy}
                className="rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
              >
                {claim.isPending ? 'Claiming...' : 'Claim case'}
              </button>
            ) : open ? (
              <p className="rounded-xl bg-surface-container/60 px-4 py-3 text-sm leading-6 text-on-surface-variant">
                This case is being reviewed by another moderator.
              </p>
            ) : null}
            {open && (claimedByMe || (data.status === 'pending' && !data.assigned_to)) && (
              <button
                type="button"
                onClick={() => setConfirmDismiss(true)}
                disabled={accountBusy}
                className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                Dismiss report
              </button>
            )}
          </div>
          {confirmDismiss && open && (
            <div className="mt-4 rounded-xl border border-outline-variant/60 bg-surface-container/50 p-3">
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
                  onClick={() => void run(resolve, { p_report_id: data.id, p_status: 'dismissed', p_note: 'no action taken' })}
                  disabled={accountBusy}
                  className="rounded-pill bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-40"
                >
                  Confirm dismiss
                </button>
              </div>
            </div>
          )}
          {data.resolution_note ? (
            <p className="mt-4 rounded-xl bg-surface-container/60 p-3 text-sm leading-6 text-on-surface-variant">
              Resolution note: {data.resolution_note}
            </p>
          ) : null}
        </div>
      </section>

      { msg ? (
        <section className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-on-surface">Reported message</h2>
            <span className="rounded-pill bg-surface-container px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
              {msg.content ? 'private chat message' : 'media attachment'}
            </span>
          </div>
          {msg.content && <p className="mt-3 rounded-xl bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">{msg.content}</p>}
          {claimedByMe && open ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton
                label="Hide message"
                pending={hideMessage.isPending}
                disabled={accountBusy}
                onClick={() =>
                  run(hideMessage, { p_message_id: msg.message_id, p_reason: reason || 'reported content', p_report_id: data.id })
                }
              />
              <ActionButton
                label="Restore message"
                pending={restoreMessage.isPending}
                disabled={accountBusy}
                onClick={() =>
                  run(restoreMessage, { p_message_id: msg.message_id, p_reason: reason || 'false positive review', p_report_id: data.id })
                }
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {isModerator && claimedByMe && open ? (
        <section className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
            <h2 className="text-sm font-semibold text-on-surface">Account action</h2>
          </div>
          <p className="mt-2 text-sm text-on-surface-variant">
            Affects {data.target_display_name} directly. Every action is recorded in the audit log.
          </p>
          <div className="mt-3 space-y-2">
            <label className="block text-sm font-semibold text-on-surface" htmlFor="moderation-reason">
              Reason for account action
              <input
                id="moderation-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this action is needed"
                maxLength={500}
                className="mt-1.5 w-full rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => run(warn, { p_user_id: data.target_user_id, p_reason: actionArgs(), p_report_id: data.id })}
                disabled={accountBusy || !actionArgs()}
                className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                Issue warning
              </button>
              <span className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant">
                Suspend
                <input
                  type="number"
                  min={1}
                  max={maxExpiryDays}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value) || 0)}
                  aria-label="Suspension duration in days"
                  className="w-16 rounded-xl border border-outline-variant/70 bg-surface-lowest px-2 py-1.5 text-center text-sm text-on-surface focus:border-primary focus:outline-none"
                />
                {isAdmin ? 'days' : 'days (max 7)'}
              </span>
              <button
                type="button"
                  onClick={() => setConfirmSuspend(true)}
                  disabled={accountBusy || !actionArgs() || !expiryValid}
                className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                Suspend for {expiryDays} days
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setBan((b) => !b)}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-error px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
                >
                  <Ban className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  {ban ? 'Cancel ban' : 'Permanently ban'}
                </button>
              ) : null}
            </div>
            {confirmSuspend && (
              <div className="rounded-xl border border-outline-variant/60 bg-surface-container/50 p-3">
                <p className="text-sm font-semibold text-on-surface">Suspend {data.target_display_name} for {expiryDays} days?</p>
                <p className="mt-1 text-xs leading-5 text-on-surface-variant">The account will be restricted until the suspension expires.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmSuspend(false)}
                    className="rounded-pill px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void run(restrict, {
                        p_user_id: data.target_user_id,
                        p_status: 'suspended',
                        p_reason: actionArgs(),
                        p_expires_at: new Date(Date.now() + expiryDays * 86_400_000).toISOString(),
                        p_report_id: data.id,
                      })
                    }
                    disabled={accountBusy || !actionArgs() || !expiryValid}
                    className="rounded-pill bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-40"
                  >
                    Confirm suspension
                  </button>
                </div>
              </div>
            )}
            {ban && isAdmin ? (
              <div className="rounded-xl border border-error/30 bg-error/5 p-3">
                <p className="text-xs leading-5 text-on-surface-variant">
                  A permanent ban revokes all roles, removes the account from active clusters, starts replacements, and
                  cannot be reverted from this screen. It is a platform safety action.
                </p>
                <button
                  type="button"
                  onClick={() => run(restrict, { p_user_id: data.target_user_id, p_status: 'banned', p_reason: actionArgs(), p_report_id: data.id })}
                  disabled={accountBusy || !actionArgs()}
                  className="mt-2 rounded-pill bg-error px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-40"
                >
                  Confirm permanent ban
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {!claimedByMe && !open ? (
        <p className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-4 text-sm text-on-surface-variant">
          This case is closed. Link it to a follow-up report if further action is needed.
        </p>
      ) : null}
    </div>
  )
}

function ActionButton({
  label,
  pending,
  disabled,
  onClick,
}: {
  label: string
  pending: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className="inline-flex items-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {label}
    </button>
  )
}

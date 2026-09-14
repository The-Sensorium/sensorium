import { useState } from 'react'
import { Ban, Gauge, ShieldAlert } from 'lucide-react'
import {
  MODERATION_SEVERITY_LABELS,
  formatError,
  targetSummary,
  useAccountSearch,
  useAddCaseNote,
  useApplyRestriction,
  useAssignCase,
  useEscalateCase,
  useIssueWarning,
  useSetCaseSeverity,
  type ModerationCaseV2Row,
  type ModerationSeverity,
} from '../../../features/admin-moderation'
import { PolicySelector, type PolicyChoice } from './PolicySelector'

const SEVERITIES: ModerationSeverity[] = ['urgent', 'high', 'medium', 'low']

export function CaseActionPanel({
  data,
  claimedByMe,
  open,
  isModerator,
  isAdmin,
}: {
  data: ModerationCaseV2Row
  claimedByMe: boolean
  open: boolean
  isModerator: boolean
  isAdmin: boolean
}) {
  const target = targetSummary(data)
  const warn = useIssueWarning()
  const restrict = useApplyRestriction()
  const setSeverity = useSetCaseSeverity()
  const escalate = useEscalateCase()
  const assign = useAssignCase()
  const addNote = useAddCaseNote()

  const [reason, setReason] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [policy, setPolicy] = useState<PolicyChoice>({ categoryCode: data.reason, template: null })
  const [expiryDays, setExpiryDays] = useState(3)
  const [ban, setBan] = useState(false)
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [severity, setSeverityChoice] = useState<ModerationSeverity>(data.severity)
  const [triageReason, setTriageReason] = useState('')
  const [escalateOpen, setEscalateOpen] = useState(false)
  const [assignQuery, setAssignQuery] = useState('')
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const accountSearch = useAccountSearch(assignQuery)
  const canTriage = open && (claimedByMe || isAdmin)
  const targetUserId = data.target_user_id ?? ''
  const canEnforce = isModerator && claimedByMe && open && targetUserId !== ''

  const accountBusy = warn.isPending || restrict.isPending
  const maxExpiryDays = isAdmin ? 999 : 7
  const expiryValid = Number.isInteger(expiryDays) && expiryDays >= 1 && expiryDays <= maxExpiryDays

  async function run<A extends object>(mut: { mutateAsync: (args: A) => Promise<unknown> }, args: A) {
    setError(null)
    setSuccess(null)
    try {
      await mut.mutateAsync(args)
      setSuccess('Action completed successfully.')
      setConfirmSuspend(false)
      setEscalateOpen(false)
      return true
    } catch (e) {
      setError(formatError(e))
      return false
    }
  }

  function actionArgs() {
    return reason.trim()
  }

  function policyCode(): string | undefined {
    return policy.categoryCode ?? undefined
  }

  async function saveInternalNote(): Promise<void> {
    const note = internalNote.trim()
    if (!note) return
    try {
      await addNote.mutateAsync({ p_report_id: data.id, p_note: note })
      setInternalNote('')
    } catch (e) {
      setError(formatError(e))
    }
  }

  function enforce<A extends object>(mut: { mutateAsync: (args: A) => Promise<unknown> }, args: A) {
    void run(mut, args).then((ok) => {
      if (ok) void saveInternalNote()
    })
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>}
      {success && <p role="status" className="rounded-md border border-primary/30 bg-primary-container/10 p-3 text-sm text-on-surface">{success}</p>}

      {canTriage && (
        <section className="rounded-lg border border-outline-variant/60 bg-surface p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <Gauge className="h-4 w-4 text-primary" strokeWidth={1.5} aria-hidden />
            Triage
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm">
              <span className="font-medium text-on-surface-variant">Severity</span>
              <select
                aria-label="Case severity"
                value={severity}
                onChange={(e) => setSeverityChoice(e.target.value as ModerationSeverity)}
                className="rounded-pill border border-outline-variant/60 bg-surface px-2.5 py-1.5 font-semibold text-on-surface"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{MODERATION_SEVERITY_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <input
              aria-label="Triage reason"
              value={triageReason}
              onChange={(e) => setTriageReason(e.target.value)}
              placeholder="Why this severity or escalation…"
              maxLength={2000}
              className="min-w-44 flex-1 rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void run(setSeverity, { p_report_id: data.id, p_severity: severity, p_reason: triageReason.trim() })}
              disabled={setSeverity.isPending || !triageReason.trim()}
              className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
            >
              Apply severity
            </button>
            {!data.escalated_at && (
              <button
                type="button"
                onClick={() => setEscalateOpen((v) => !v)}
                className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
              >
                Escalate
              </button>
            )}
          </div>
          {escalateOpen && !data.escalated_at && (
            <div className="mt-3 rounded-md border border-outline-variant/60 bg-surface-container/50 p-3">
              <p className="text-sm font-semibold text-on-surface">Escalate this case?</p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                Flags the case as escalated and raises low/medium severity to high. Uses the triage reason above.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEscalateOpen(false)}
                  className="rounded-pill px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void run(escalate, { p_report_id: data.id, p_reason: triageReason.trim() })}
                  disabled={escalate.isPending || !triageReason.trim()}
                  className="rounded-pill bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-40"
                >
                  Confirm escalation
                </button>
              </div>
            </div>
          )}
          {isAdmin && (
            <div className="mt-3 border-t border-outline-variant/50 pt-3">
              <label className="block text-sm font-semibold text-on-surface" htmlFor="case-assign-search">
                Reassign case
                <input
                  id="case-assign-search"
                  value={assignQuery}
                  onChange={(e) => {
                    setAssignQuery(e.target.value)
                    setAssigneeId(null)
                  }}
                  placeholder="Search staff by name or email…"
                  className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                />
              </label>
              {accountSearch.data && accountSearch.data.length > 0 && assigneeId === null && (
                <ul className="mt-2 space-y-1">
                  {accountSearch.data.slice(0, 5).map((account) => (
                    <li key={account.user_id}>
                      <button
                        type="button"
                        onClick={() => {
                          setAssigneeId(account.user_id)
                          setAssignQuery(account.display_name ?? account.email ?? account.user_id)
                        }}
                        className="w-full rounded-md px-3 py-2 text-left text-sm text-on-surface transition-colors hover:bg-surface-container"
                      >
                        {account.display_name ?? account.email ?? account.user_id}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!assigneeId) return
                    void run(assign, { p_report_id: data.id, p_assignee: assigneeId, p_reason: triageReason.trim() })
                  }}
                  disabled={assign.isPending || !assigneeId || !triageReason.trim()}
                  className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
                >
                  Reassign
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {canEnforce ? (
        <section className="rounded-lg border border-outline-variant/60 bg-surface p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
            <h2 className="text-sm font-semibold text-on-surface">Account action</h2>
          </div>
          <p className="mt-2 text-sm text-on-surface-variant">
            Affects {target.display_name ?? 'Unknown member'} directly. Every action is recorded in the audit log.
          </p>
          <div className="mt-3 space-y-2">
            <PolicySelector
              choice={policy}
              onChange={setPolicy}
              onUseNotice={(notice) => setReason(notice)}
            />
            <label className="block text-sm font-semibold text-on-surface" htmlFor="moderation-reason">
              User-facing reason
              <input
                id="moderation-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What the member will be told"
                maxLength={500}
                className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block text-sm font-semibold text-on-surface" htmlFor="moderation-internal-note">
              Internal note <span className="font-normal text-on-surface-variant">(staff only, optional)</span>
              <input
                id="moderation-internal-note"
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Rationale for the audit trail…"
                maxLength={2000}
                className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
              />
            </label>
            {!actionArgs() && (
              <p className="text-xs text-on-surface-variant">
                Enter a user-facing reason above to enable warning and suspension.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => enforce(warn, { p_user_id: targetUserId, p_reason: actionArgs(), p_report_id: data.id, p_policy_code: policyCode() })}
                disabled={accountBusy || !actionArgs()}
                title={!actionArgs() ? 'Enter a user-facing reason above first' : undefined}
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
                  className="w-16 rounded-lg border border-outline-variant/70 bg-surface-lowest px-2 py-1.5 text-center text-sm text-on-surface focus:border-primary focus:outline-none"
                />
                {isAdmin ? 'days' : 'days (max 7)'}
              </span>
              <button
                type="button"
                  onClick={() => setConfirmSuspend(true)}
                  disabled={accountBusy || !actionArgs() || !expiryValid}
                  title={!actionArgs() ? 'Enter a user-facing reason above first' : undefined}
                className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                Suspend for {expiryDays} days
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setBan((b) => !b)}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-error px-4 py-2 text-sm font-semibold text-on-error transition-colors hover:opacity-90"
                >
                  <Ban className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  {ban ? 'Cancel ban' : 'Permanently ban'}
                </button>
              ) : null}
            </div>
            {confirmSuspend && (
              <div className="rounded-md border border-outline-variant/60 bg-surface-container/50 p-3">
                <p className="text-sm font-semibold text-on-surface">Suspend {target.display_name} for {expiryDays} days?</p>
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
                      enforce(restrict, {
                        p_user_id: targetUserId,
                        p_status: 'suspended',
                        p_reason: actionArgs(),
                        p_expires_at: new Date(Date.now() + expiryDays * 86_400_000).toISOString(),
                        p_report_id: data.id,
                        p_policy_code: policyCode(),
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
              <div className="rounded-md border border-error/30 bg-error/5 p-3">
                <p className="text-xs leading-5 text-on-surface-variant">
                  A permanent ban revokes all roles, removes the account from active clusters, starts replacements, and
                  cannot be reverted from this screen. It is a platform safety action.
                </p>
                <button
                  type="button"
                  onClick={() => enforce(restrict, { p_user_id: targetUserId, p_status: 'banned', p_reason: actionArgs(), p_report_id: data.id, p_policy_code: policyCode() })}
                  disabled={accountBusy || !actionArgs()}
                  className="mt-2 rounded-pill bg-error px-4 py-2 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-40"
                >
                  Confirm permanent ban
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}


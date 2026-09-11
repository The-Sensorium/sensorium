import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ArrowLeft, CheckCircle2, Loader2, MessageSquareWarning } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { useBackOr } from '../../lib/use-back-or'
import { cn } from '../../lib/utils'
import {
  APPEAL_STATUS_LABELS,
  appellantSummary,
  isAppealOverdue,
  originalAction,
  recentReports,
  useAddAppealNote,
  useAdminAppealV2,
  useAssignAppeal,
  useClaimAppeal,
  useDecideAppeal,
  useReleaseAppeal,
  useRequestSecondReview,
  formatAppealError,
} from '../../features/appeals'
import { useModerationPolicies } from '../../features/admin-moderation'
import { useStaffAccountSearch } from '../../features/admin-accounts'
import { useMyAccess } from '../../features/access'
import { timeAgo, timeUntil } from '../../features/notifications'

const MAX_RESPONSE = 2000

const DECISION_TEMPLATES = [
  {
    key: 'grant',
    title: 'Grant template',
    text: 'After reviewing your appeal, we have decided to lift the restriction on your account. Thank you for your patience.',
  },
  {
    key: 'reject',
    title: 'Reject template',
    text: 'After reviewing your appeal, the restriction on your account stands. Please follow the community guidelines to avoid further action.',
  },
] as const

export function AdminAppealCasePage() {
  useDocumentTitle('Appeal case')
  const { appealId } = useParams<{ appealId: string }>()
  const { pathname } = useLocation()
  const base = '/admin'
  const goBack = useBackOr(pathname.replace(/\/[^/]+$/, ''))
  const appeal = useAdminAppealV2(appealId)
  const access = useMyAccess()
  const policies = useModerationPolicies()

  const claim = useClaimAppeal()
  const release = useReleaseAppeal()
  const assign = useAssignAppeal()
  const addNote = useAddAppealNote()
  const requestReview = useRequestSecondReview()
  const decide = useDecideAppeal()

  const [accept, setAccept] = useState<boolean | null>(null)
  const [response, setResponse] = useState('')
  const [internalRationale, setInternalRationale] = useState('')
  const [policyCode, setPolicyCode] = useState('')
  const [secondConfirmed, setSecondConfirmed] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [assignQuery, setAssignQuery] = useState('')
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const accountSearch = useStaffAccountSearch(assignQuery)
  const adminOptions = (accountSearch.data ?? []).filter((a) => a.roles.includes('admin'))

  if (appeal.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  const data = appeal.data

  if (appeal.isError || !data) {
    return (
      <div className="rounded-lg border border-error/30 bg-error/10 p-10 text-center">
        <p className="text-sm font-semibold text-error">Could not load this appeal.</p>
        <button
          type="button"
          onClick={() => void appeal.refetch()}
          className="mt-4 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          Try Again
        </button>
      </div>
    )
  }

  const open = data.status === 'submitted'
  const appealRowId = data.id
  const myUserId = access.data?.user_id ?? null
  const claimedByMe = data.assigned_to === myUserId
  const overdue = isAppealOverdue(data.review_due_at, data.status)
  const appellant = appellantSummary(data)
  const action = originalAction(data)
  const reports = recentReports(data)
  const isBanAppeal = data.appealed_status === 'banned'
  const needsSecondReview = open && !accept && isBanAppeal
  const secondRequestedByMe = data.second_review_requested_by === myUserId
  const secondRequestedByOther =
    data.second_review_requested_by != null && data.second_review_requested_by !== myUserId
  const busy = claim.isPending || release.isPending || assign.isPending || decide.isPending

  async function run(mut: { mutateAsync: (args: never) => Promise<unknown> }, args: Record<string, unknown>) {
    setError(null)
    setSuccess(null)
    try {
      await (mut.mutateAsync as (args: Record<string, unknown>) => Promise<unknown>)(args)
      return true
    } catch (e) {
      setError(formatAppealError(e))
      return false
    }
  }

  async function handleDecide() {
    if (accept === null || !response.trim()) return
    setError(null)
    setSuccess(null)
    try {
      await decide.mutateAsync({
        p_appeal_id: appealRowId,
        p_accept: accept,
        p_response: response.trim(),
        p_internal_note: internalRationale.trim() || undefined,
        p_decision_reason_code: policyCode || undefined,
        p_second_review_confirmed: secondConfirmed,
      })
      setSuccess(accept ? 'Appeal granted. The account restriction has been lifted.' : 'Appeal rejected. The restriction stands.')
      setAccept(null)
      setResponse('')
      setInternalRationale('')
      setSecondConfirmed(false)
    } catch (cause) {
      setError(formatAppealError(cause))
    }
  }

  async function saveNote() {
    if (!noteDraft.trim()) return
    const ok = await run(addNote, { p_appeal_id: appealRowId, p_note: noteDraft.trim() })
    if (ok) {
      setNoteDraft('')
      setSuccess('Note saved.')
    }
  }

  const categories = (policies.data ?? []).filter(
    (row, index, all) => all.findIndex((r) => r.category_code === row.category_code) === index,
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-pill border border-outline-variant/60 text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </button>
          <div>
            <h1 className="font-display text-3xl font-semibold text-on-surface">Appeal case</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              {data.display_name ?? 'A deleted account'} appealed a {data.appealed_status} decision.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span
            title="Appeal status: under review or resolved."
            className="rounded-md bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant"
          >
            Status: {APPEAL_STATUS_LABELS[data.status]}
          </span>
          {data.assigned_to_display_name && (
            <span
              title="The admin reviewing this appeal."
              className="rounded-md bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant"
            >
              Assignee: {data.assigned_to_display_name}
            </span>
          )}
          {overdue && (
            <span className="rounded-md bg-error/10 px-3 py-1.5 text-xs font-semibold text-error">
              Overdue
            </span>
          )}
        </div>
      </header>

      <dl
        className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-outline-variant/60 bg-outline-variant/60 ${
          data.decided_at ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        }`}
      >
        {[
          { label: 'Submitted', value: timeAgo(data.created_at) },
          { label: 'Review due', value: data.review_due_at ? timeUntil(data.review_due_at) : 'No due date' },
          ...(data.decided_at ? [{ label: 'Decided', value: timeAgo(data.decided_at) }] : []),
        ].map((item) => (
          <div key={item.label} className="bg-surface px-3 py-2">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{item.label}</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold text-on-surface" title={item.value}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {error && (
        <p role="alert" className="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>
      )}
      {success && (
        <p role="status" className="rounded-md border border-primary/30 bg-primary-container/10 p-3 text-sm text-on-surface">{success}</p>
      )}

      {open && (
        <div className="flex flex-wrap gap-2">
          {claimedByMe ? (
            <button
              type="button"
              onClick={() => void run(release, { p_appeal_id: data.id })}
              disabled={busy}
              className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
            >
              Release appeal
            </button>
          ) : data.assigned_to == null ? (
            <button
              type="button"
              onClick={() => void run(claim, { p_appeal_id: data.id })}
              disabled={busy}
              className="rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
            >
              {claim.isPending ? 'Claiming...' : 'Claim appeal'}
            </button>
          ) : (
            <p className="rounded-md bg-surface-container/60 px-4 py-2 text-sm text-on-surface-variant">
              Assigned to {data.assigned_to_display_name ?? 'another admin'}.
            </p>
          )}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-outline-variant/60 bg-surface p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <MessageSquareWarning className="h-4 w-4 text-primary" strokeWidth={1.5} aria-hidden />
            Appellant
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Member</dt>
              <dd className="font-medium text-on-surface">
                {data.user_id ? (
                  <Link to={`${base}/accounts/${data.user_id}`} className="font-semibold text-primary">
                    {data.display_name ?? 'Deleted account'}
                  </Link>
                ) : (
                  (data.display_name ?? 'Deleted account')
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Status</dt>
              <dd className="font-medium capitalize text-on-surface">{appellant.account_status}</dd>
            </div>
            {appellant.roles.length > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Roles</dt>
                <dd className="flex flex-wrap justify-end gap-1">
                  {appellant.roles.map((role) => (
                    <span key={role} className="rounded-md bg-surface-container px-2 py-0.5 text-[11px] font-semibold capitalize text-on-surface-variant">
                      {role}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Prior reports</dt>
              <dd className="font-medium text-on-surface">{appellant.prior_reports}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Prior enforcement</dt>
              <dd className="font-medium text-on-surface">{appellant.prior_actions} actions</dd>
            </div>
          </dl>
          {data.details && (
            <div className="mt-3 border-t border-outline-variant/50 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Their appeal</h3>
              <p className="mt-2 rounded-md bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">{data.details}</p>
            </div>
          )}
        </div>

        <div className="grid content-start gap-4">
          <div className="rounded-lg border border-outline-variant/60 bg-surface p-4">
            <h2 className="text-sm font-semibold text-on-surface">Original decision</h2>
            {action?.id ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-on-surface-variant">Action</dt>
                  <dd className="font-medium capitalize text-on-surface">{(action.action ?? '').replace(/_/g, ' ')}</dd>
                </div>
                {action.actor_display_name && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">Decided by</dt>
                    <dd className="font-medium text-on-surface">{action.actor_display_name}</dd>
                  </div>
                )}
                {action.policy_code && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-on-surface-variant">Policy</dt>
                    <dd className="font-medium capitalize text-on-surface">{action.policy_code.replace(/_/g, ' ')}</dd>
                  </div>
                )}
                {action.reason && <p className="rounded-md bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">{action.reason}</p>}
                {data.original_report_id && (
                  <Link to={`${base}/reports/${data.original_report_id}`} className="mt-1 inline-block text-xs font-semibold text-primary">
                    Open original case
                  </Link>
                )}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-on-surface-variant">
                Appealed {data.appealed_status}: {data.appealed_reason}
                {data.original_report_id && (
                  <>
                    {' '}
                    <Link to={`${base}/reports/${data.original_report_id}`} className="font-semibold text-primary">
                      Open original case
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>

          {reports.length > 0 && (
            <div className="rounded-lg border border-outline-variant/60 bg-surface p-4">
              <h2 className="text-sm font-semibold text-on-surface">Recent reports against them</h2>
              <ul className="mt-3 space-y-2">
                {reports.map((report) => (
                  <li key={report.id} className="flex items-center justify-between gap-3 rounded-md bg-surface-container/60 px-3 py-2 text-sm">
                    <span className="truncate text-on-surface">
                      {report.reason.replace(/_/g, ' ')} · {report.status}
                    </span>
                    <Link
                      to={`${base}/reports/${report.id}`}
                      className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
                    >
                      Open case
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-outline-variant/60 bg-surface p-4">
        <h2 className="text-sm font-semibold text-on-surface">Internal note</h2>
        {data.internal_note ? (
          <p className="mt-3 rounded-md bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">{data.internal_note}</p>
        ) : (
          <p className="mt-3 text-sm text-on-surface-variant">No internal note yet. Staff-only; never shared with the appellant.</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              aria-label="Appeal internal note"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Staff-only context or handoff…"
              maxLength={2000}
              data-e2e="appeal-note-draft"
              className="min-w-44 flex-1 rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void saveNote()}
              disabled={addNote.isPending || !noteDraft.trim()}
              data-e2e="appeal-note-save"
              className="rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-40"
            >
              {addNote.isPending ? 'Saving…' : 'Save note'}
            </button>
          </div>
      </section>

      {open ? (
        <section className="rounded-lg border border-outline-variant/60 bg-surface p-4">
          <h2 className="text-sm font-semibold text-on-surface">Decision</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAccept(true)}
                  aria-pressed={accept === true}
                  className={cn(
                    'rounded-pill border px-4 py-2 text-sm font-semibold transition-colors',
                    accept === true
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-outline-variant/60 text-on-surface hover:bg-surface-container',
                  )}
                >
                  Grant appeal
                </button>
                <button
                  type="button"
                  onClick={() => setAccept(false)}
                  aria-pressed={accept === false}
                  className={cn(
                    'rounded-pill border px-4 py-2 text-sm font-semibold transition-colors',
                    accept === false
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-outline-variant/60 text-on-surface hover:bg-surface-container',
                  )}
                >
                  Reject appeal
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="font-medium text-on-surface-variant">Policy</span>
                <select
                  aria-label="Decision policy"
                  value={policyCode}
                  onChange={(e) => setPolicyCode(e.target.value)}
                  className="rounded-lg border border-outline-variant/60 bg-surface px-2.5 py-1.5 font-semibold text-on-surface"
                >
                  <option value="">Custom / no policy</option>
                  {categories.map((c) => (
                    <option key={c.category_code} value={c.category_code}>
                      {c.category_title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                {DECISION_TEMPLATES.map((template) => (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => {
                      setResponse(template.text)
                      setAccept(template.key === 'grant')
                    }}
                    className="rounded-md border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
                  >
                    {template.title}
                  </button>
                ))}
              </div>
              {needsSecondReview && (
                <div className="rounded-md bg-surface-container/60 p-3 text-sm">
                  {secondRequestedByOther ? (
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={secondConfirmed}
                        onChange={(e) => setSecondConfirmed(e.target.checked)}
                        className="mt-1"
                      />
                      <span>
                        Another admin already reviewed this rejection. Rejecting a ban appeal needs their sign-off,
                        and you cannot be the reviewer.
                      </span>
                    </label>
                  ) : secondRequestedByMe ? (
                    <p className="text-on-surface-variant">
                      You requested the second review, so a different admin must reject this appeal.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="w-full text-on-surface-variant">
                        Rejecting a ban appeal needs a second admin review first.
                      </p>
                      <button
                        type="button"
                        onClick={() => void run(requestReview, { p_appeal_id: data.id })}
                        disabled={busy}
                        className="rounded-md border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
                      >
                        Request second review
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-on-surface" htmlFor="appeal-internal-rationale">
                Internal rationale <span className="font-normal text-on-surface-variant">(staff only, optional)</span>
                <textarea
                  id="appeal-internal-rationale"
                  value={internalRationale}
                  onChange={(e) => setInternalRationale(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Why this decision is correct…"
                  className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-on-surface" htmlFor="appeal-response">
                Response for the appellant
                <textarea
                  id="appeal-response"
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  maxLength={MAX_RESPONSE}
                  rows={4}
                  placeholder="Explain the decision in your own words."
                  className="mt-1.5 w-full resize-y rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                />
              </label>
              <p className="text-right text-xs text-on-surface-variant">
                {response.length.toLocaleString()} / {MAX_RESPONSE.toLocaleString()}
              </p>
              {!response.trim() && (
                <p className="text-xs text-on-surface-variant">
                  Write the appellant response above to enable the decision.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleDecide()}
            disabled={decide.isPending || accept === null || response.trim().length === 0}
            className="mt-4 inline-flex items-center gap-2 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {decide.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {accept === true ? 'Grant appeal' : 'Reject appeal'}
          </button>
        </section>
      ) : (
        <div className="space-y-3">
          {data.response && (
            <div className="rounded-md bg-surface-container/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Response sent</p>
              <p className="mt-1 text-sm leading-6 text-on-surface">{data.response}</p>
            </div>
          )}
          <p className="rounded-lg border border-dashed border-outline-variant bg-surface-container/40 p-4 text-sm text-on-surface-variant">
            This appeal is resolved. The outcome was emailed to the appellant.
          </p>
        </div>
      )}

      {open && (
        <section className="rounded-lg border border-outline-variant/60 bg-surface p-4">
          <h2 className="text-sm font-semibold text-on-surface">Reassign appeal</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              aria-label="Reassign appeal search"
              value={assignQuery}
              onChange={(e) => {
                setAssignQuery(e.target.value)
                setAssigneeId(null)
              }}
              placeholder="Search admins by name or email…"
              className="min-w-44 flex-1 rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (!assigneeId) return
                void run(assign, { p_appeal_id: data.id, p_assignee: assigneeId, p_reason: 'Reassigned' })
              }}
              disabled={assign.isPending || !assigneeId}
              className="rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
            >
              Reassign
            </button>
          </div>
          {adminOptions.length > 0 && assigneeId === null && (
            <ul className="mt-2 space-y-1">
              {adminOptions.slice(0, 5).map((account) => (
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
        </section>
      )}
    </div>
  )
}

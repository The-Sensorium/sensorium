import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { cn } from '../../lib/utils'
import { APPEAL_STATUS_LABELS, useAdminAppeal, useDecideAppeal } from '../../features/appeals'
import { formatError } from '../../features/admin-moderation'
import { timeAgo } from '../../features/notifications'

const MAX_RESPONSE = 2000

export function AdminAppealCasePage() {
  useDocumentTitle('Appeal case')
  const { appealId } = useParams<{ appealId: string }>()
  const appeals = useAdminAppeal(appealId)
  const decide = useDecideAppeal()
  const [accept, setAccept] = useState<boolean | null>(null)
  const [response, setResponse] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (appeals.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  const data = appeals.data

  if (appeals.isError || !data) {
    return (
      <div className="rounded-2xl border border-error/30 bg-error/10 p-10 text-center">
        <p className="text-sm font-semibold text-error">Could not load this appeal.</p>
        <button
          type="button"
          onClick={() => void appeals.refetch()}
          className="mt-4 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          Try Again
        </button>
      </div>
    )
  }

  const appeal = data
  const open = appeal.status === 'submitted'

  async function handleDecide() {
    setError(null)
    setSuccess(null)
    try {
      await decide.mutateAsync({ p_appeal_id: appeal.id, p_accept: accept === true, p_response: response.trim() })
      setSuccess(accept ? 'Appeal granted. The account restriction has been lifted.' : 'Appeal rejected. The restriction stands.')
      setAccept(null)
      setResponse('')
    } catch (cause) {
      setError(formatError(cause))
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-3">
          <Link to=".." className="grid h-9 w-9 place-items-center rounded-pill border border-outline-variant/60 text-on-surface-variant transition-colors hover:bg-surface-container">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </Link>
          <div>
            <h1 className="font-display text-3xl font-semibold text-on-surface">Appeal case</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              {appeal.display_name ?? 'A deleted account'} appealed a {appeal.appealed_status} decision.
            </p>
          </div>
        </div>
        <span className="rounded-pill bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
          {APPEAL_STATUS_LABELS[appeal.status]} - submitted {timeAgo(appeal.created_at)}
        </span>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>
      )}
      {success && (
        <p role="status" className="rounded-2xl border border-primary/30 bg-primary-container/10 p-3 text-sm text-on-surface">{success}</p>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-on-surface">Appeal details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Account status</dt>
              <dd className="font-medium capitalize text-on-surface">
                {appeal.appealed_status === 'suspended' ? 'suspended' : 'banned'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Current status</dt>
              <dd className="font-medium capitalize text-on-surface">{appeal.current_account_status}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-on-surface-variant">Reason given</dt>
              <dd className="font-medium text-on-surface">{appeal.appealed_reason}</dd>
            </div>
            {appeal.appealed_expires_at ? (
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Suspension ends</dt>
                <dd className="font-medium text-on-surface">{new Date(appeal.appealed_expires_at).toLocaleDateString()}</dd>
              </div>
            ) : null}
            {appeal.current_restriction_reason ? (
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Restriction reason</dt>
                <dd className="font-medium text-on-surface">{appeal.current_restriction_reason}</dd>
              </div>
            ) : null}
          </dl>
          {appeal.response ? (
            <p className="mt-4 rounded-xl bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">
              Response: {appeal.response}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-on-surface">Their appeal</h2>
          <p className="mt-3 rounded-xl bg-surface-container/60 p-3 text-sm leading-6 text-on-surface">{appeal.details}</p>
        </div>
      </section>

      {open ? (
        <section className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-on-surface">Decision</h2>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">
            Granting lifts the restriction and sends the appellant the outcome at their account email. The response below
            is shared with them verbatim.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
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

          <label className="mt-4 block text-sm font-semibold text-on-surface" htmlFor="appeal-response">
            Response for the appellant
            <textarea
              id="appeal-response"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              maxLength={MAX_RESPONSE}
              rows={4}
              placeholder="Explain the decision in your own words."
              className="mt-1.5 w-full resize-y rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2.5 text-sm font-normal text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
            />
          </label>
          <p className="mt-1 text-right text-xs text-on-surface-variant">
            {response.length.toLocaleString()} / {MAX_RESPONSE.toLocaleString()}
          </p>

          <button
            type="button"
            onClick={() => void handleDecide()}
            disabled={decide.isPending || accept === null || response.trim().length === 0}
            className="mt-3 inline-flex items-center gap-2 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {decide.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {accept === true ? 'Grant appeal' : 'Reject appeal'}
          </button>
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-4 text-sm text-on-surface-variant">
          This appeal is resolved. The outcome was emailed to the appellant.
        </p>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Clock3, Loader2, MailWarning, Send } from 'lucide-react'
import { Link } from 'react-router'
import { useDocumentTitle } from '../lib/use-document-title'
import { useMyAccess } from '../features/access'
import { APPEAL_STATUS_LABELS, useMyAppeal, useSubmitAppeal } from '../features/appeals'
import { timeAgo } from '../features/notifications'

const MAX_DETAILS = 5000

function formatError(message: string): string {
  if (message.includes('details_required')) return 'Please tell us why you’re appealing the decision.'
  if (message.includes('details_too_long')) return `Appeals are limited to ${MAX_DETAILS.toLocaleString()} characters.`
  if (message.includes('account_not_restricted'))
    return 'Your account is not restricted, so there is nothing to appeal right now.'
  return message
}

/** The appeal lane for suspended/banned accounts (target of the email CTA). */
export function AppealPage() {
  useDocumentTitle('Appeal a decision')
  const access = useMyAccess()
  const appeals = useMyAppeal()
  const submit = useSubmitAppeal()
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (access.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  const current = appeals.data?.[0] ?? null
  const restricted =
    access.data?.account_status === 'suspended' || access.data?.account_status === 'banned'
  const open = current?.status === 'submitted'

  async function handleSubmit() {
    setError(null)
    setSuccess(null)
    try {
      await submit.mutateAsync(details)
      setSuccess('Your appeal has been submitted. We’ll review it and send you the outcome.')
      setDetails('')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(formatError(message))
    }
  }

  const needsForm = restricted && !open

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="rounded-2xl bg-surface-lowest p-8 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-container/15 text-primary">
              <MailWarning className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold text-on-surface">Appeal a decision</h1>
              <p className="text-sm text-on-surface-variant">
                {access.data?.account_status === 'suspended' ? 'About your suspension' : 'About your account'}
              </p>
            </div>
          </div>

          {!access.data ? (
            <p className="mt-6 text-sm leading-6 text-on-surface-variant">Couldn’t load your account status.</p>
          ) : open ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant">
                <Clock3 className="h-5 w-5" aria-hidden />
                {APPEAL_STATUS_LABELS[current.status]}
                <span className="ml-auto text-xs font-normal text-on-surface-variant">{timeAgo(current.created_at)}</span>
              </div>

              <div className="rounded-2xl border border-outline-variant/60 bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Your appeal</p>
                <p className="mt-2 text-sm leading-6 text-on-surface">{current.details}</p>
              </div>

              <p className="text-sm leading-6 text-on-surface-variant">
                Appeals are reviewed by our staff. You’ll receive the outcome at the email address on your account.
              </p>
            </div>
          ) : (
            <>
              {current?.status === 'resolved' && current.response ? (
                <div className="mt-6 rounded-2xl border border-primary/30 bg-primary-container/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Previous outcome</p>
                  <p className="mt-2 text-sm leading-6 text-on-surface">{current.response}</p>
                </div>
              ) : null}

              <p className="mt-6 text-sm leading-6 text-on-surface-variant">
                {access.data.account_status === 'suspended'
                  ? 'Your account is temporarily suspended. If you think this is a mistake, appeal the decision below.'
                  : 'Your account has been restricted. If you think this is a mistake, appeal the decision below.'}
              </p>

              <label htmlFor="appeal-details" className="mt-6 block text-sm font-semibold text-on-surface">
                Why should this be reconsidered?
              </label>
              <textarea
                id="appeal-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={MAX_DETAILS}
                rows={6}
                className="mt-2 w-full resize-y rounded-2xl border border-outline-variant/60 bg-surface px-4 py-3 text-sm leading-6 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Tell us what happened in your own words."
                aria-describedby="appeal-char-count"
              />
              <p id="appeal-char-count" className="mt-1 text-right text-xs text-on-surface-variant">
                {details.length.toLocaleString()} / {MAX_DETAILS.toLocaleString()}
              </p>

              {error && (
                <p role="alert" className="mt-3 rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">
                  {error}
                </p>
              )}
              {success && (
                <p role="status" className="mt-3 rounded-2xl border border-primary/30 bg-primary-container/10 p-3 text-sm text-on-surface">
                  {success}
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submit.isPending || details.trim().length === 0}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
              >
                {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
                Submit appeal
              </button>
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-4">
          <Link to="/restricted" className="text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface">
            Back to account status
          </Link>
        </div>

        {!needsForm && (
          <p className="text-center text-xs leading-5 text-on-surface-variant">
            You can also sign out from the account status page if you’re done.
          </p>
        )}
      </div>
    </div>
  )
}
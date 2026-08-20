import { useState } from 'react'
import { AlertOctagon, Loader2, LogOut, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useDocumentTitle } from '../lib/use-document-title'
import { requireSupabase } from '../lib/supabase'
import { useMyAccess } from '../features/access'
import { useDeleteAccount } from '../features/moderation'

export function RestrictedAccountPage() {
  useDocumentTitle('Account restricted')
  const navigate = useNavigate()
  const access = useMyAccess()
  const deleteAccount = useDeleteAccount()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (access.isLoading || access.isError || !access.data) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
          {access.isLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          ) : (
            <div>
              <p className="text-sm font-semibold text-on-surface">Couldn’t load your account status.</p>
              <button
                type="button"
                onClick={() => void access.refetch()}
                className="mt-4 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const status = access.data.account_status
  const suspended = status === 'suspended'

  async function signOut() {
    try {
      const supabase = requireSupabase()
      await supabase.auth.signOut()
      navigate('/auth/login')
    } catch {
      setError('Could not sign out. Please try again.')
    }
  }

  async function handleDelete() {
    setError(null)
    try {
      await deleteAccount.mutateAsync()
    } catch {
      setError('Could not delete your account. Please try again.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-2xl bg-surface-lowest p-8 text-center shadow-soft">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-error/10 text-error">
            <ShieldAlert className="h-7 w-7" strokeWidth={1.5} aria-hidden />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-on-surface">
            {suspended ? 'Account suspended' : 'Account restricted'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-on-surface-variant">
            {suspended
              ? 'Your account is temporarily unavailable. If you think this is a mistake, contact support to appeal.'
              : 'Your account is no longer able to use Sensorium. If you think this is a mistake, contact support to appeal.'}
          </p>
          {suspended && access.data.restriction_expires_at ? (
            <p className="mt-3 text-sm font-semibold text-on-surface">
              Your access resumes on {new Date(access.data.restriction_expires_at).toLocaleDateString()}.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          {error && <p className="rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">{error}</p>}
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center justify-center gap-2 rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Sign out
          </button>

          {confirming ? (
            <div className="rounded-2xl border border-error/30 bg-error/5 p-4">
              <p className="flex items-start gap-2 text-sm leading-6 text-on-surface-variant">
                <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-error" strokeWidth={1.5} aria-hidden />
                Deleting your account permanently removes it. This cannot be undone.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleteAccount.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-pill bg-error px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  {deleteAccount.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  Delete my account
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-pill border border-outline-variant/60 px-6 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
                >
                  Keep my account
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-pill border border-outline-variant/60 px-6 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
            >
              Delete my account
            </button>
          )}
        </div>

        <p className="text-center text-xs leading-5 text-on-surface-variant">
          Need help? Contact{' '}
          <a href="mailto:support@sensorium.app" className="font-medium text-primary hover:underline">
            support@sensorium.app
          </a>
        </p>
      </div>
    </div>
  )
}
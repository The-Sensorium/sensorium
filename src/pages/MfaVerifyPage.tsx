import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '../lib/use-document-title'
import { toErrorMessage } from '../lib/error'
import { useAuth } from '../app/auth-context'
import { isMobileDevice } from '../lib/device'
import {
  formatMfaError,
  listVerifiedTotpFactorIds,
  mfaStatusKey,
  needsMfaVerify,
  useMfaStatus,
  verifyTotpCode,
} from '../features/staff-mfa'

export function MfaVerifyPage() {
  useDocumentTitle('Two-step verification')
  const navigate = useNavigate()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const status = useMfaStatus()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Mobile browsers skip the staff MFA step and stay in the member shell.
  if (isMobileDevice()) return <Navigate to="/home" replace />

  if (status.isError) {
    return (
      <div className="rounded-2xl bg-surface-lowest p-8 text-center shadow-soft" data-e2e="mfa-verify">
        <h1 className="text-xl font-semibold text-on-surface">Couldn’t check verification status</h1>
        <p className="mt-3 text-sm leading-6 text-on-surface-variant">
          Something went wrong while checking your account. Your access is not granted until this loads.
        </p>
        <button
          type="button"
          onClick={() => void status.refetch()}
          className="mt-6 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!status.isLoading && !needsMfaVerify(status.data)) {
    return <Navigate to="/entry" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const ids = await listVerifiedTotpFactorIds()
      const factorId = ids[0]
      if (!factorId) throw new Error('No authenticator enrolled. Set one up first.')
      await verifyTotpCode(factorId, code)
      // Refresh the cached assurance level before leaving: /entry routes on
      // it, and a stale AAL1 would bounce straight back here.
      if (userId) {
        await queryClient.invalidateQueries({ queryKey: mfaStatusKey(userId) })
        await queryClient.refetchQueries({ queryKey: mfaStatusKey(userId) })
      }
      navigate('/entry', { replace: true })
    } catch (err) {
      setError(formatMfaError(toErrorMessage(err, 'Something went wrong.')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl bg-surface-lowest p-8 shadow-soft" data-e2e="mfa-verify">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden />
          <h1 className="text-xl font-semibold text-on-surface">Check your authenticator</h1>
        </div>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">
          Enter the 6-digit code from your authenticator app to continue to staff tools.
        </p>

        {status.isLoading ? (
          <div className="mt-6 flex justify-center" role="status" aria-label="Loading">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-on-surface">6-digit code</span>
              <input
                data-e2e="mfa-verify-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface px-4 py-2.5 text-base tracking-[0.3em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:text-sm"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            )}
            <button
              type="submit"
              data-e2e="mfa-verify-submit"
              disabled={busy}
              className="w-full rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
            >
              {busy ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        )}
    </div>
  )
}

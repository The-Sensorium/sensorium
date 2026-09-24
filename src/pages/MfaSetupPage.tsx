import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../components/Modal'
import { isMobileDevice } from '../lib/device'
import { useDocumentTitle } from '../lib/use-document-title'
import { toErrorMessage } from '../lib/error'
import {
  enrollTotpFresh,
  formatMfaError,
  mfaStatusKey,
  unenrollTotpFactor,
  useMfaStatus,
  verifyTotpCode,
  type TotpEnrollment,
} from '../features/staff-mfa'
import { useAuth } from '../app/auth-context'

export function MfaSetupPage() {
  useDocumentTitle('Two-step verification setup')
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const status = useMfaStatus()
  const queryClient = useQueryClient()
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)

  // Staff two-step setup is desktop-only: mobile browsers stay in the
  // member shell with no enroll UI.
  if (isMobileDevice()) return <Navigate to="/home" replace />

  async function refresh() {
    if (userId) await queryClient.invalidateQueries({ queryKey: mfaStatusKey(userId) })
  }

  async function onEnroll() {
    setError(null)
    setDone(false)
    setBusy(true)
    try {
      setEnrollment(await enrollTotpFresh())
    } catch (err) {
      setError(formatMfaError(toErrorMessage(err, 'Something went wrong.')))
    } finally {
      setBusy(false)
    }
  }

  async function onConfirm(e: FormEvent) {
    e.preventDefault()
    if (!enrollment) return
    setError(null)
    setBusy(true)
    try {
      await verifyTotpCode(enrollment.factorId, code)
      setEnrollment(null)
      setCode('')
      setDone(true)
      await refresh()
    } catch (err) {
      setError(formatMfaError(toErrorMessage(err, 'Something went wrong.')))
    } finally {
      setBusy(false)
    }
  }

  async function onUnenroll() {
    if (!pendingRemove) return
    setError(null)
    setBusy(true)
    try {
      await unenrollTotpFactor(pendingRemove)
      setPendingRemove(null)
      setDone(false)
      await refresh()
    } catch (err) {
      setError(formatMfaError(toErrorMessage(err, 'Something went wrong.')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl bg-surface-lowest p-8 shadow-soft" data-e2e="mfa-setup">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden />
          <h1 className="text-xl font-semibold text-on-surface">Two-step verification</h1>
        </div>
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">
          Staff accounts protect moderation and role tools with an authenticator code. Members can skip
          this entirely.
        </p>

        {status.isLoading ? (
          <div className="mt-6 flex justify-center" role="status" aria-label="Loading">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          </div>
        ) : status.isError ? (
          <div className="mt-6 space-y-4 text-center">
            <p className="text-sm leading-6 text-on-surface-variant">
              Couldn’t check your authenticators. Setup is unavailable until this loads.
            </p>
            <button
              type="button"
              onClick={() => void status.refetch()}
              className="rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {done && (
              <p role="status" className="rounded-lg bg-surface-container px-4 py-3 text-sm text-on-surface">
                Authenticator connected. Staff sign-ins will ask for a code from now on.
              </p>
            )}

            {status.data != null && status.data.verifiedTotpCount > 0 && !enrollment ? (
              <div className="space-y-3">
                <p className="text-sm text-on-surface">
                  {status.data.verifiedTotpCount} authenticator connected.
                </p>
                <ul className="space-y-2">
                  {status.data.verifiedTotpIds.map((factorId, i) => (
                    <li
                      key={factorId}
                      className="flex items-center justify-between gap-2 rounded-lg bg-surface-container px-4 py-2.5 text-sm text-on-surface"
                    >
                      <span>Authenticator {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => setPendingRemove(factorId)}
                        disabled={busy}
                        className="font-semibold text-error hover:underline disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onEnroll}
                    disabled={busy}
                    className="rounded-pill border border-outline-variant/70 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-low disabled:opacity-60"
                  >
                    Add another
                  </button>
                  <Link
                    to="/entry"
                    className="rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
                  >
                    Done
                  </Link>
                </div>
              </div>
            ) : enrollment == null ? (
              <button
                type="button"
                onClick={onEnroll}
                disabled={busy}
                className="w-full rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
              >
                {busy ? 'Starting...' : 'Set up authenticator'}
              </button>
            ) : (
              <div className="space-y-4">
                {enrollment.qrCode.startsWith('data:') && (
                  <img src={enrollment.qrCode} alt="Authenticator QR code" className="mx-auto h-48 w-48" />
                )}
                <p className="text-sm leading-6 text-on-surface-variant">
                  Scan the code with your authenticator app, or enter this secret manually:
                </p>
                <code
                  data-e2e="mfa-secret"
                  className="block break-all rounded-lg bg-surface-container px-4 py-3 font-mono text-sm text-on-surface"
                >
                  {enrollment.secret}
                </code>
                <form onSubmit={onConfirm} className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-semibold text-on-surface">6-digit code</span>
                    <input
                      data-e2e="mfa-code-input"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface px-4 py-2.5 text-base tracking-[0.3em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:text-sm"
                    />
                  </label>
                  <button
                    type="submit"
                    data-e2e="mfa-confirm"
                    disabled={busy}
                    className="w-full rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
                  >
                    {busy ? 'Confirming...' : 'Confirm and enable'}
                  </button>
                </form>
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            )}
          </div>
        )}
      <Modal open={pendingRemove !== null} onClose={() => setPendingRemove(null)} title="Remove authenticator?">
        <p className="mt-2 text-sm leading-6 text-on-surface-variant">
          Staff sign-ins will no longer ask for a code. If this is your only authenticator, set up a new one
          before your next staff sign-in.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPendingRemove(null)}
            className="min-h-[44px] rounded-pill px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            data-e2e="mfa-remove-confirm"
            onClick={() => void onUnenroll()}
            disabled={busy}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-error px-5 py-3 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Remove
          </button>
        </div>
      </Modal>
    </div>
  )
}

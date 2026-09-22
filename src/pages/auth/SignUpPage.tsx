import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { requireSupabase } from '../../lib/supabase'
import { toErrorMessage } from '../../lib/error'
import { GoogleIcon } from '../../components/GoogleIcon'
import { PasswordInput } from '../../components/PasswordInput'
import { CaptchaSection } from '../../components/TurnstileWidget'
import { turnstileSiteKey } from '../../lib/turnstile'

export function SignUpPage() {
  useDocumentTitle('Sign Up')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaFailed, setCaptchaFailed] = useState(false)
  const [widgetKey, setWidgetKey] = useState(0)
  const siteKey = turnstileSiteKey()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const redirect = `${window.location.origin}/auth/verify-email`
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirect,
          ...(captchaToken ? { captchaToken } : {}),
        },
      })
      if (error) throw error
      sessionStorage.setItem('sensorium:signup-email', email)
      setDone(true)
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
    } finally {
      setCaptchaToken(null)
      setCaptchaFailed(false)
      setWidgetKey((k) => k + 1)
      setSubmitting(false)
    }
  }

  async function onGoogleSignUp() {
    setError(null)
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/entry` },
      })
      if (error) throw error
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return <Navigate to="/auth/verify-email" replace />

  return (
    <div className="rounded-2xl bg-surface-lowest p-8 shadow-soft">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-2 text-sm text-on-surface-variant">
        Verify your email and complete your profile to get started.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-on-surface">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface px-4 py-2.5 text-base leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:text-sm"
          />
        </label>
        <PasswordInput
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          minLength={8}
        />
        <PasswordInput
          label="Confirm Password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          required
        />
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <CaptchaSection
          siteKey={siteKey}
          widgetKey={widgetKey}
          tokenReady={captchaToken !== null}
          failed={captchaFailed}
          onToken={setCaptchaToken}
          onFailed={() => setCaptchaFailed(true)}
          onRetry={() => {
            setCaptchaFailed(false)
            setWidgetKey((k) => k + 1)
          }}
        />
        <button
          type="submit"
          disabled={submitting || Boolean(siteKey && !captchaToken)}
          className="w-full rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
        >
          {submitting ? 'Creating…' : 'Create Account'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-on-surface-variant">
        Already have an account?{' '}
        <Link to="/auth/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="h-px w-full bg-outline-variant/70" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-surface-lowest px-2 text-on-surface-variant">OR</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onGoogleSignUp}
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 rounded-pill border border-outline-variant/70 bg-transparent px-6 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-low disabled:opacity-60"
      >
        <GoogleIcon className="h-5 w-5" />
        Continue with Google
      </button>
    </div>
  )
}

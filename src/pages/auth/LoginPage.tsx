import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { requireSupabase } from '../../lib/supabase'
import { toErrorMessage } from '../../lib/error'
import { GoogleIcon } from '../../components/GoogleIcon'

export function LoginPage() {
  useDocumentTitle('Log In')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      // RequireGuest redirects to /home once the session is set.
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function onGoogleLogin() {
    setError(null)
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
      if (error) throw error
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl bg-surface-lowest p-5 shadow-soft sm:p-8">
      <h1 className="text-xl font-semibold sm:text-2xl">Welcome back</h1>
      <p className="mt-1 text-xs text-on-surface-variant sm:mt-2 sm:text-sm">Sign in to your clusters.</p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3 sm:mt-6 sm:space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-on-surface sm:text-sm">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-outline-variant/70 bg-surface px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:mt-1.5 sm:px-4 sm:py-2.5 sm:text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-on-surface sm:text-sm">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-outline-variant/70 bg-surface px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:mt-1.5 sm:px-4 sm:py-2.5 sm:text-sm"
          />
        </label>
        <div className="flex items-center justify-between">
          <Link to="/auth/forgot-password" className="text-xs text-primary hover:underline sm:text-sm">
            Forgot password?
          </Link>
        </div>
        {error && <p className="text-xs text-error sm:text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-pill bg-primary px-4 py-2.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60 sm:px-6 sm:py-3 sm:text-sm"
        >
          Login
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-on-surface-variant sm:mt-6 sm:text-sm">
        New here?{' '}
        <Link to="/auth/signup" className="font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </p>
      <div className="relative my-4 sm:my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="h-px w-full bg-outline-variant/70" />
        </div>
        <div className="relative flex justify-center text-[10px] uppercase sm:text-xs">
          <span className="bg-surface-lowest px-2 text-on-surface-variant">OR</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onGoogleLogin}
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 rounded-pill border border-outline-variant/70 bg-transparent px-4 py-2.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-low disabled:opacity-60 sm:px-6 sm:py-3 sm:text-sm"
      >
        <GoogleIcon className="h-4 w-4 sm:h-5 sm:w-5" />
        Continue with Google
      </button>
    </div>
  )
}

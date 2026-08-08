import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { requireSupabase } from '../../lib/supabase'
import { toErrorMessage } from '../../lib/error'

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

  // TODO(google-login): Re-enable Google OAuth once configured for the prod domain.
  // Previously: signed in via supabase.auth.signInWithOAuth({ provider: 'google' }), and the
  // "Continue with Google" button sat below the "or" divider after </form>.
  // To enable, add the Google provider in the Supabase dashboard and unset the anon role's
  // OAuth restriction, then re-add the button here.

  return (
    <div className="rounded-2xl bg-surface-lowest p-8 shadow-soft">
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-2 text-sm text-on-surface-variant">Sign in to your clusters.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-on-surface">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-on-surface">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <div className="flex items-center justify-between">
          <Link to="/auth/forgot-password" className="text-sm text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
        >
          Login
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-on-surface-variant">
        New here?{' '}
        <Link to="/auth/signup" className="font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { requireSupabase } from '../../lib/supabase'

export function ResetPasswordPage() {
  useDocumentTitle('Reset Password')
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return <Navigate to="/auth/login" replace />

  return (
    <div className="rounded-2xl bg-surface-lowest p-8 shadow-soft">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-on-surface">New Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
        >
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-on-surface-variant">
        <Link to="/auth/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}

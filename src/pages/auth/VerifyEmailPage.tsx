import { useState } from 'react'
import { Link } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { requireSupabase } from '../../lib/supabase'

export function VerifyEmailPage() {
  useDocumentTitle('Verify Email')
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function resend() {
    const email = sessionStorage.getItem('sensorium:signup-email')
    if (!email) {
      setMessage('We could not find your email. Please sign up again.')
      return
    }
    setMessage(null)
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/verify-email` },
      })
      setMessage('We re-sent the confirmation email to your inbox.')
    } catch {
      setMessage('Could not resend the email. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl bg-surface-lowest p-8 text-center shadow-soft">
      <h1 className="text-2xl font-semibold">Verify your email address</h1>
      <p className="mt-3 text-sm leading-6 text-on-surface-variant">
        We sent a confirmation link to your inbox. Click it to activate your account, then sign in.
      </p>
      <button
        type="button"
        onClick={resend}
        disabled={submitting}
        className="mt-6 rounded-pill border border-outline-variant/60 px-6 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
      >
        {submitting ? 'Sending…' : 'Resend email'}
      </button>
      {message && (
        <p role="status" className="mt-4 text-sm text-on-surface-variant">
          {message}
        </p>
      )}
      <p className="mt-6 text-sm text-on-surface-variant">
        <Link to="/auth/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

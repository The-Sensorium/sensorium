import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { requireSupabase } from '../lib/supabase'
import { Modal } from './Modal'

export function SignOutModal({
  open,
  onClose,
  onSignedOut,
}: {
  open: boolean
  onClose: () => void
  onSignedOut: () => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSignOut() {
    setError(null)
    setPending(true)
    try {
      const supabase = requireSupabase()
      await supabase.auth.signOut()
      queryClient.clear()
      onSignedOut()
    } catch {
      setError('Could not sign out. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Sign out?">
      <div className="mt-4 space-y-4">
        <p className="text-sm leading-6 text-on-surface-variant">
          You'll need to sign back in to see your clusters and conversations.
        </p>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-pill border border-outline-variant/70 px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={pending}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Sign out
          </button>
        </div>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { Loader2, Volume2, VolumeX } from 'lucide-react'
import { useAuth } from '../app/auth-context'
import { useIsMuted, useMuteUser, useUnmuteUser } from '../features/moderation'
import { Modal } from './Modal'

export function MuteButton({
  targetUserId,
  targetName,
  fullWidth = false,
}: {
  targetUserId: string
  targetName: string
  fullWidth?: boolean
}) {
  const auth = useAuth()
  const selfId = auth.state === 'signedIn' ? auth.userId : null
  const muted = useIsMuted(targetUserId)
  const mute = useMuteUser()
  const unmute = useUnmuteUser()
  const pending = mute.isPending || unmute.isPending
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmKind, setConfirmKind] = useState<'mute' | 'unmute' | null>(null)

  if (selfId !== null && targetUserId === selfId) return null

  const label = muted ? 'Unmute' : 'Mute'
  const Icon = muted ? Volume2 : VolumeX
  const error = mute.error ?? unmute.error
  const dialogUnmute = (confirmKind ?? (muted ? 'unmute' : 'mute')) === 'unmute'
  const dialogTitle = dialogUnmute ? `Unmute ${targetName}?` : `Mute ${targetName}?`
  const dialogLabel = dialogUnmute ? 'Unmute' : 'Mute'
  const DialogIcon = dialogUnmute ? Volume2 : VolumeX

  function openConfirm() {
    setConfirmError(null)
    setConfirmKind(muted ? 'unmute' : 'mute')
    setConfirmOpen(true)
  }

  function closeConfirm() {
    setConfirmOpen(false)
    setConfirmError(null)
    setConfirmKind(null)
  }

  async function handleConfirm() {
    setConfirmError(null)
    try {
      if (dialogUnmute) {
        await unmute.mutateAsync({ targetUserId })
      } else {
        await mute.mutateAsync({ targetUserId, displayName: targetName })
      }
      closeConfirm()
    } catch {
      setConfirmError('Couldn’t update. Try again.')
    }
  }

  return (
    <span
      className={
        fullWidth
          ? 'flex w-full items-center gap-2 md:inline-flex md:w-auto'
          : 'inline-flex items-center gap-2'
      }
    >
      <button
        type="button"
        disabled={pending}
        onClick={() => openConfirm()}
        aria-label={`${label} ${targetName}`}
        aria-haspopup="dialog"
        className={
          fullWidth
            ? 'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60 md:w-28 md:flex-none'
            : 'inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60'
        }
      >
        <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        {label}
      </button>
      {error && (
        <span role="alert" className="text-xs text-error">
          Couldn’t update. Try again.
        </span>
      )}
      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!pending) {
            closeConfirm()
          }
        }}
        title={dialogTitle}
      >
        {dialogUnmute ? (
          <p className="mt-3 text-sm text-on-surface-variant">
            Unmuting {targetName} shows their messages, posts, comments, and signals again
            right away.
          </p>
        ) : (
          <p className="mt-3 text-sm text-on-surface-variant">
            Muting {targetName} hides their messages, posts, comments, and signals for you
            only, in every shared cluster. Membership, votes, and presence stay the same.
            They are never told. You can unmute anytime.
          </p>
        )}
        {confirmError && (
          <p role="alert" className="mt-3 text-sm text-error">
            {confirmError}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => closeConfirm()}
            disabled={pending}
            className="min-h-[44px] rounded-pill px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={pending}
            aria-label={`${dialogLabel} ${targetName} now`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <DialogIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            )}
            {pending ? 'Saving…' : dialogLabel}
          </button>
        </div>
      </Modal>
    </span>
  )
}

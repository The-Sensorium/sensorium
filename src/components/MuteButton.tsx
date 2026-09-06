import { Volume2, VolumeX } from 'lucide-react'
import { useAuth } from '../app/auth-context'
import { useIsMuted, useMuteUser, useUnmuteUser } from '../features/moderation'

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

  if (selfId !== null && targetUserId === selfId) return null

  const action = muted ? unmute : mute
  const label = muted ? 'Unmute' : 'Mute'
  const Icon = muted ? Volume2 : VolumeX
  const error = mute.error ?? unmute.error

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
        onClick={() => action.mutate({ targetUserId })}
        aria-label={`${label} ${targetName}`}
        className={
          fullWidth
            ? 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60 md:w-28 md:flex-none'
            : 'inline-flex items-center gap-1.5 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60'
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
    </span>
  )
}

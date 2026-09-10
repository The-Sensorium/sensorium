import { useEffect, useRef, useState } from 'react'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import { Clock, Loader2, X } from 'lucide-react'
import { CALL_WARNING_SECONDS, useCallToken } from '../../../features/cluster-calls'
import { cn } from '../../../lib/utils'
import { formatCallDuration } from './format'

interface CallOverlayProps {
  callId: string
  videoOnJoin: boolean
  startedAt: string
  expiresAt: string
  onHangUp: () => void
}

/**
 * Wall-clock for the call: elapsed since it started and seconds until the
 * server-side `expires_at`. When the budget runs out the overlay hangs up,
 * which leaves gracefully; the server's cron would end it regardless.
 */
function useCallClock(startedAt: string, expiresAt: string, onExpired: () => void) {
  const [now, setNow] = useState(() => Date.now())
  const firedRef = useRef(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const started = Date.parse(startedAt)
  const expires = Date.parse(expiresAt)
  const elapsed = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0
  const remaining = Number.isFinite(expires)
    ? Math.max(0, Math.floor((expires - now) / 1000))
    : Number.POSITIVE_INFINITY

  useEffect(() => {
    if (remaining <= 0 && !firedRef.current) {
      firedRef.current = true
      onExpired()
    }
  }, [remaining, onExpired])

  return { elapsed, remaining }
}

// Full-screen in-call surface. The LiveKit token only grants camera + microphone
// (no screen share), so VideoConference's control bar renders without the
// screen-share control. Hanging up (the conference leave control, the close
// button, a dropped connection, or the duration limit) removes only this
// participant via leave_call; the call stays live for everyone else and ends
// when the last participant leaves.
export function CallOverlay({ callId, videoOnJoin, startedAt, expiresAt, onHangUp }: CallOverlayProps) {
  const tokenQuery = useCallToken(callId, true)
  const { elapsed, remaining } = useCallClock(startedAt, expiresAt, onHangUp)
  const warning = remaining <= CALL_WARNING_SECONDS

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cluster call"
      data-e2e="call-overlay"
      className="fixed inset-0 z-50 flex flex-col bg-surface"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-on-surface">Cluster call</h2>
          <span
            data-e2e="call-duration"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold tabular-nums',
              warning ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-on-surface-variant',
            )}
          >
            <Clock className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            {warning ? `${formatCallDuration(remaining)} left` : formatCallDuration(elapsed)}
          </span>
        </div>
        <button
          type="button"
          aria-label="Hang up"
          data-e2e="hang-up-call"
          onClick={onHangUp}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant/60 bg-surface text-on-surface transition-colors hover:bg-surface-container"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1" data-lk-theme="default">
        {tokenQuery.isPending ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Joining the call…
          </div>
        ) : tokenQuery.isError || !tokenQuery.data ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm text-on-surface-variant">
              Could not join the call. It may have ended — try starting a new one.
            </p>
            <button
              type="button"
              onClick={onHangUp}
              className="rounded-pill border border-outline-variant/60 bg-surface px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
            >
              Close
            </button>
          </div>
        ) : (
          <LiveKitRoom
            serverUrl={tokenQuery.data.url}
            token={tokenQuery.data.token}
            connect
            audio
            video={videoOnJoin}
            onDisconnected={onHangUp}
          >
            <VideoConference />
          </LiveKitRoom>
        )}
      </div>
    </div>
  )
}

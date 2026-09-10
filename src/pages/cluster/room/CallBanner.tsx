import { Phone } from 'lucide-react'
import type { Call } from '../../../features/cluster-calls'

interface CallBannerProps {
  call: Call
  initiatorName: string
  participantCount: number
  joined: boolean
  pending: boolean
  onJoin: () => void
  onOpen: () => void
}

export function CallBanner({
  call,
  initiatorName,
  participantCount,
  joined,
  pending,
  onJoin,
  onOpen,
}: CallBannerProps) {
  return (
    <section
      aria-label="Cluster call"
      data-e2e="call-banner"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-primary/40 bg-primary-container/30 px-4 py-3 shadow-soft"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary" aria-hidden>
        <Phone className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold text-on-surface">
          {joined
            ? 'You are in this call'
            : call.status === 'ringing'
              ? `${initiatorName} started a call`
              : 'A call is live'}
        </p>
        <p className="text-xs text-on-surface-variant">
          {participantCount} {participantCount === 1 ? 'person' : 'people'} in the call
        </p>
      </div>
      <button
        type="button"
        data-e2e={joined ? 'return-to-call' : 'join-call'}
        onClick={joined ? onOpen : onJoin}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
      >
        {joined ? 'Return to call' : 'Join'}
      </button>
    </section>
  )
}

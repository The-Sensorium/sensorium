import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, X } from 'lucide-react'
import { useAuth } from '../../../app/auth-context'
import { MEETUP_ENABLED, formatSlotShortDot } from '../../../lib/meetup'
import { useClusterMeetups, useMeetupState } from '../../../features/meetups'

function dismissalKey(userId: string, clusterId: string) {
  return `sensorium:dismissed-meetup:${userId}:${clusterId}`
}

function readDismissedMeetup(userId: string | null, clusterId: string): string | null {
  if (!userId) return null
  try {
    return localStorage.getItem(dismissalKey(userId, clusterId))
  } catch {
    return null
  }
}

/** Quiet entry point rendered in the room above the composer. Hidden when the flag is off. */
export function MeetupCard({ clusterId }: { clusterId: string }) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const meetups = useClusterMeetups(MEETUP_ENABLED ? clusterId : null)
  const rows = MEETUP_ENABLED ? (meetups.data ?? []) : []
  const voting = rows.find((m) => m.status === 'voting') ?? null
  const voteState = useMeetupState(voting ? voting.id : null)
  const [dismissedId, setDismissedId] = useState<string | null>(() => readDismissedMeetup(userId, clusterId))

  if (!MEETUP_ENABLED) return null
  if (meetups.isPending) {
    return (
      <div className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft" aria-label="Cluster meetup loading">
        <div className="h-5 w-32 animate-pulse rounded bg-surface-container" aria-hidden />
      </div>
    )
  }
  const active = rows.find((m) => ['proposed', 'voting', 'confirmed', 'starting', 'active'].includes(m.status))
  const lastDone = rows.find((m) => m.status === 'completed')
  if (active && active.id === dismissedId) return null

  function dismiss() {
    if (!active) return
    setDismissedId(active.id)
    if (userId) {
      try {
        localStorage.setItem(dismissalKey(userId, clusterId), active.id)
      } catch {
        // Private mode: dismissal lasts for this session only.
      }
    }
  }

  // The list carries no per-user vote info. While the vote state is still
  // loading the banner stays neutral ("View") so voters never see a stale
  // "Vote" prompt; on error it falls back to the "Vote" prompt as before.
  // Voters get no banner at all until the meetup is confirmed.
  const voteResolved = voting === null || voteState.data !== undefined || voteState.isError
  const showVotePrompt = voting !== null && voteResolved && voteState.data?.my_slot_id == null
  if (voting !== null && voteResolved && !showVotePrompt) return null

  return (
    <div
      data-e2e="meetup-card"
      className="flex items-center gap-3 rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-container/20 text-primary">
        <CalendarDays className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-semibold text-on-surface">Cluster Meetup</p>
        <p className="truncate text-xs text-on-surface-variant">
          {active
            ? active.status === 'voting'
              ? showVotePrompt
                ? 'Vote for a time this week.'
                : 'You voted. Waiting for others.'
              : active.starts_at
                ? formatSlotShortDot(active.starts_at)
                : 'A meetup is being planned.'
            : lastDone
              ? 'You met this week.'
              : 'Meet the people behind the messages.'}
        </p>
      </div>
      <Link
        to={`/cluster/${clusterId}/meetups`}
        className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-pill bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
      >
        {active ? (active.status === 'voting' ? (showVotePrompt ? 'Vote' : 'View') : 'View') : 'Propose a time'}
      </Link>
      {active && (
        <button
          type="button"
          aria-label="Dismiss meetup banner"
          onClick={dismiss}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <X className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </button>
      )}
    </div>
  )
}

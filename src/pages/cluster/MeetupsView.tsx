import { Suspense, lazy, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CalendarDays, Check, Clock, Loader2, Users } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { cn } from '../../lib/utils'
import { rateLimitMessage, toErrorMessage } from '../../lib/error'
import { MEETUP_ENABLED, MEETUP_JOIN_LEAD_MS, MEETUP_QUORUM, canJoinMeetup, formatSlotDot, formatSlotShortDot, hasEnded, hasStarted, isLive, pluralize } from '../../lib/meetup'
import { useAuth } from '../../app/auth-context'
import { useClusterMembers } from '../../features/matching'
import { useActiveCall, useJoinCall, useStartCall, useLeaveCall } from '../../features/cluster-calls'
import {
  useCancelMeetup,
  useCheckInMeetup,
  useClusterMeetups,
  useMeetupState,
  useRsvpMeetup,
  useVoteMeetupSlot,
} from '../../features/meetups'
import { CountdownTimer } from '../../components/CountdownTimer'
import { Avatar } from '../../components/Avatar'
import { Modal } from '../../components/Modal'
import { PreJoinDialog } from './room/PreJoinDialog'
const CallOverlay = lazy(() => import('./room/CallOverlay').then((m) => ({ default: m.CallOverlay })))

export function MeetupsView() {
  useDocumentTitle('Meetups')
  const { clusterId = '' } = useParams()
  const enabled = MEETUP_ENABLED && clusterId !== ''

  const meetups = useClusterMeetups(enabled ? clusterId : null)
  const members = useClusterMembers(enabled ? clusterId : null)

  const active = useMemo(
    () => (meetups.data ?? []).find((m) => ['proposed', 'voting', 'confirmed', 'starting', 'active'].includes(m.status)) ?? null,
    [meetups.data],
  )
  const lastDone = useMemo(
    () => (meetups.data ?? []).find((m) => m.status === 'completed') ?? null,
    [meetups.data],
  )

  if (!MEETUP_ENABLED) return null

  if (meetups.isPending || members.isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading meetups…
      </div>
    )
  }

  if (meetups.isError) {
    return (
      <div className="rounded-2xl border border-error/30 bg-error/10 p-5 text-sm text-error" role="alert">
        Could not load meetups. Try again.
      </div>
    )
  }

  if (!active) {
    const latest = (meetups.data ?? [])[0] ?? null
    // Only genuine no-quorum expiry gets the expired banner. A withdrawn
    // proposal (cancelled_reason 'withdrawn') shows just the propose card;
    // pre-0179 rows carry null and render as expired, as before.
    const showExpired = latest?.status === 'cancelled' && latest.cancelled_reason !== 'withdrawn'
    return (
      <section aria-label="Cluster meetup" className="space-y-5">
        {showExpired ? (
          <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center">
            <p className="font-display text-lg font-semibold text-on-surface">This meetup expired</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              Fewer than {MEETUP_QUORUM} people voted in time. Propose a new time below.
            </p>
          </div>
        ) : (
          lastDone && (
            <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
              <p className="font-display text-base font-semibold text-on-surface">You met this week</p>
              <p className="mt-0.5 text-sm text-on-surface-variant">Thanks for joining your Cluster Meetup.</p>
            </div>
          )
        )}
        <ProposeCard clusterId={clusterId} />
      </section>
    )
  }

  return (
    <section aria-label="Cluster meetup" className="space-y-5">
      <MeetupDetail key={active.id} clusterId={clusterId} meetupId={active.id} members={members.data ?? []} />
    </section>
  )
}

function ProposeCard({ clusterId }: { clusterId: string }) {
  return (
    <div data-e2e="meetup-card" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-container/20 text-primary">
          <CalendarDays className="h-6 w-6" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-on-surface">Cluster Meetup</h2>
          <p className="text-sm text-on-surface-variant">Meet the people behind the messages.</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-on-surface">Pick a few times for a casual group call this week.</p>
      <Link
        to={`/cluster/${clusterId}/meetups/new`}
        className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
      >
        Propose a time
      </Link>
    </div>
  )
}

function MeetupDetail({
  clusterId,
  meetupId,
  members,
}: {
  clusterId: string
  meetupId: string
  members: Array<{ id: string; display_name: string | null; avatar_url: string | null }>
}) {
  const memberCount = members.length
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const state = useMeetupState(meetupId)
  const vote = useVoteMeetupSlot(clusterId, meetupId)
  const cancel = useCancelMeetup(clusterId, meetupId)
  const checkIn = useCheckInMeetup(clusterId, meetupId)
  const rsvp = useRsvpMeetup(clusterId, meetupId)
  const startCall = useStartCall(clusterId)
  const joinCall = useJoinCall(clusterId)
  const leaveCall = useLeaveCall(clusterId)
  const activeCall = useActiveCall(clusterId)

  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inCall, setInCall] = useState(false)
  const [callId, setCallId] = useState<string | null>(null)
  const [preJoin, setPreJoin] = useState(false)
  const [micOnJoin, setMicOnJoin] = useState(true)
  const [cameraOnJoin, setCameraOnJoin] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  if (state.isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading meetup…
      </div>
    )
  }
  if (state.isError || !state.data) {
    return (
      <div className="rounded-2xl border border-error/30 bg-error/10 p-5 text-sm text-error" role="alert">
        Could not load this meetup. Try again.
      </div>
    )
  }

  const detail = state.data
  const meetup = detail.meetup
  const mySlot = selected ?? detail.my_slot_id
  const joinable = meetup.starts_at ? canJoinMeetup(meetup.starts_at) : false
  const isCreator = userId !== null && meetup.created_by === userId
  const hasVoted = detail.my_slot_id !== null
  const votedShown = Math.max(0, Math.min(detail.votes_cast, memberCount))
  const quorum = detail.quorum ?? MEETUP_QUORUM

  async function handleVote() {
    if (!mySlot) return
    setError(null)
    try {
      await vote.mutateAsync(mySlot)
      setSelected(null)
      setEditing(false)
    } catch (err) {
      setError(rateLimitMessage(err, 'Could not submit your vote'))
    }
  }

  function startEditing() {
    setSelected(detail.my_slot_id)
    setEditing(true)
  }

  async function handleConfirmJoin() {
    setError(null)
    try {
      const resolvedId = activeCall.data?.id ?? (await startCall.mutateAsync())
      if (activeCall.data?.id) await joinCall.mutateAsync(activeCall.data.id)
      try {
        await checkIn.mutateAsync()
      } catch {
        // Attendance is best-effort; the call join already succeeded.
      }
      setPreJoin(false)
      setCallId(resolvedId)
      setInCall(true)
    } catch (e) {
      setError(toErrorMessage(e, 'Could not join the meetup. Try again.'))
    }
  }

  async function handleHangUp(hangUpId: string) {
    try {
      await leaveCall.mutateAsync(hangUpId)
    } finally {
      setInCall(false)
      setCallId(null)
    }
  }

  if (meetup.status === 'cancelled') {
    const withdrawn = meetup.cancelled_reason === 'withdrawn'
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center">
        <p className="font-display text-lg font-semibold text-on-surface">
          {withdrawn ? 'This proposal was withdrawn' : 'This meetup expired'}
        </p>
        {!withdrawn && (
          <p className="mt-1 text-sm text-on-surface-variant">Fewer than {MEETUP_QUORUM} people voted in time. Propose a new time below.</p>
        )}
        <div className="mt-4">
          <ProposeCard clusterId={clusterId} />
        </div>
      </div>
    )
  }

  if (meetup.status === 'completed') {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 text-center shadow-soft">
          <p className="font-display text-lg font-semibold text-on-surface">You met this week</p>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            {pluralize(detail.checked_in_count, 'member', 'members')} joined your Cluster Meetup.
          </p>
          <Link
            to={`/cluster/${clusterId}/meetups/new`}
            className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            Propose a time for next week
          </Link>
        </div>
      </div>
    )
  }

  if (meetup.status === 'confirmed' || meetup.status === 'starting' || meetup.status === 'active') {
    const confirmed = detail.slots.find((s) => s.id === meetup.confirmed_slot_id) ?? null
    const startsAt = meetup.starts_at ?? confirmed?.starts_at ?? null
    const endsAt = meetup.ends_at ?? confirmed?.ends_at ?? null
    const started = hasStarted(startsAt)
    const endsValid = endsAt ? !Number.isNaN(new Date(endsAt).getTime()) : false
    const live = isLive(startsAt, endsAt) || (started && !endsValid && canJoinMeetup(startsAt))
    const ended = hasEnded(endsAt)
    const endsLabel = endsAt
      ? new Date(endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : null
    // propose stays hidden here: create_meetup rejects with meetup_active
    // until expire_meetups completes this row, then the propose card appears.
    // Stay on the live card while a call may still be up: local overlay, a
    // live cluster call (other tab/device), or an open rejoin window.
    if (ended && !inCall && !activeCall.data?.id && !canJoinMeetup(startsAt)) {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 text-center shadow-soft">
            <CalendarDays className="mx-auto h-8 w-8 text-primary" strokeWidth={1.5} aria-hidden />
            <p className="mt-2 font-display text-lg font-semibold text-on-surface">You met this week</p>
            <p className="mt-0.5 text-sm text-on-surface-variant">
              {pluralize(detail.checked_in_count, 'member', 'members')} joined your Cluster Meetup.
            </p>
            <p className="mt-0.5 text-sm text-on-surface-variant">This meetup has ended.</p>
          </div>
        </div>
      )
    }
    const overlayCallId = callId ?? activeCall.data?.id ?? null
    const overlayStartedAt = activeCall.data?.created_at ?? new Date().toISOString()
    const joiningCount =
      detail.going_user_ids !== undefined && detail.going_user_ids !== null
        ? Math.max(detail.going_count, detail.checked_in_count)
        : detail.votes_cast
    const iAmIn = detail.my_rsvp === 'going'
    const memberById = new Map(members.map((m) => [m.id, m]))
    // Avatars follow the live going list (same data as the count). Pre-0183
    // backends omit going_user_ids, so fall back to confirmed-slot voters.
    const joiningIds =
      detail.going_user_ids !== undefined && detail.going_user_ids !== null
        ? detail.going_user_ids
        : (meetup.confirmed_slot_id ? detail.voters.filter((v) => v.slot_id === meetup.confirmed_slot_id) : []).map(
            (v) => v.user_id,
          )
    const joiningMembers = joiningIds
      .map((id) => memberById.get(id))
      .filter((m): m is (typeof members)[number] => m !== undefined)
    const shownJoining = joiningMembers.slice(0, 5)
    const joiningOverflow = Math.max(0, joiningCount - shownJoining.length)

    async function handleConfirmJoinRsvp() {
      setError(null)
      try {
        await rsvp.mutateAsync('going')
        setJoinOpen(false)
      } catch (e) {
        setJoinOpen(false)
        setError(toErrorMessage(e, 'Could not update your RSVP. Try again.'))
      }
    }

    async function handleConfirmDecline() {
      setError(null)
      try {
        await rsvp.mutateAsync('declined')
        setDeclineOpen(false)
      } catch (e) {
        setDeclineOpen(false)
        setError(toErrorMessage(e, 'Could not update your RSVP. Try again.'))
      }
    }

    return (
      <div className="space-y-4">
        <div data-e2e="meetup-confirmed" className="rounded-2xl border border-outline-variant/60 bg-surface px-5 py-4 text-center shadow-soft">
          <CalendarDays className="mx-auto h-8 w-8 text-primary" strokeWidth={1.5} aria-hidden />
          <p className="mt-2 font-display text-lg font-semibold text-on-surface">Your cluster meetup is set</p>
          <p className="mt-1 text-xl font-semibold text-on-surface">
            {startsAt ? formatSlotDot(startsAt) : ''}
          </p>
          {shownJoining.length > 0 && (
            <div
              className="mt-2 flex items-center justify-center"
              role="img"
              aria-label={pluralize(joiningCount, 'member joining', 'members joining')}
            >
              <div className="flex -space-x-2">
                {shownJoining.map((m) => (
                  <Avatar key={m.id} name={m.display_name ?? ''} src={m.avatar_url} className="h-7 w-7 ring-2 ring-surface" />
                ))}
                {joiningOverflow > 0 && (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-container text-[11px] font-semibold text-on-surface-variant ring-2 ring-surface">
                    +{joiningOverflow}
                  </span>
                )}
              </div>
            </div>
          )}
          <p className="mt-1 text-sm text-on-surface-variant">{pluralize(joiningCount, 'member joining', 'members joining')}</p>
          {live ? (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-on-surface-variant">
              <Clock className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
              <span>
                <span className="font-semibold text-primary">Live now</span>
                {endsLabel ? ` - ends ${endsLabel}` : ''}
              </span>
            </p>
          ) : startsAt && !started ? (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-on-surface-variant">
              <Clock className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
              <span>
                Starts in <CountdownTimer deadline={startsAt} />
              </span>
            </p>
          ) : null}
          {startsAt && (
            <p className="mt-1 text-center text-xs text-on-surface-variant">Times are shown in your local time.</p>
          )}
          {error && (
            <p role="alert" className="mt-2 rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-left text-sm text-error">
              {error}
            </p>
          )}
          {!iAmIn ? (
            hasVoted ? (
              <button
                type="button"
                data-e2e="meetup-rsvp-join"
                disabled={rsvp.isPending}
                onClick={() => setJoinOpen(true)}
                className="mt-2 min-h-[44px] w-full rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
              >
                Count me in
              </button>
            ) : (
              <div className="mt-2 rounded-xl border border-outline-variant/60 bg-surface-container px-4 py-2.5">
                <p className="text-sm text-on-surface">Didn&apos;t vote? You can still join us.</p>
                <button
                  type="button"
                  data-e2e="meetup-rsvp-join"
                  disabled={rsvp.isPending}
                  onClick={() => setJoinOpen(true)}
                  className="mt-2 min-h-[44px] w-full rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
                >
                  Count me in
                </button>
              </div>
            )
          ) : started ? null : (
            <div className="mt-2 text-center">
              <button
                type="button"
                data-e2e="meetup-rsvp-decline"
                disabled={rsvp.isPending}
                onClick={() => setDeclineOpen(true)}
                className="mt-1 min-h-[44px] px-5 py-1.5 text-center text-base font-semibold text-primary underline underline-offset-4 transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                I can’t make it
              </button>
            </div>
          )}
          <Modal open={declineOpen} onClose={() => setDeclineOpen(false)} title="Can’t make it?">
            <p className="pt-2 text-sm text-on-surface-variant">You’ll be removed from the meetup. The meetup time won’t change.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                data-e2e="meetup-rsvp-decline-cancel"
                onClick={() => setDeclineOpen(false)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-pill border border-outline-variant/60 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
              >
                Keep me in
              </button>
              <button
                type="button"
                data-e2e="meetup-rsvp-decline-confirm"
                disabled={rsvp.isPending}
                onClick={() => void handleConfirmDecline()}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-pill bg-error px-5 py-2.5 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {rsvp.isPending ? 'Saving…' : 'I can’t make it'}
              </button>
            </div>
          </Modal>
          <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Count me in?">
            <p className="pt-2 text-sm text-on-surface-variant">You’ll be added to the meetup. We’ll remind you before it starts.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                data-e2e="meetup-rsvp-join-cancel"
                onClick={() => setJoinOpen(false)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-pill border border-outline-variant/60 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
              >
                Cancel
              </button>
              <button
                type="button"
                data-e2e="meetup-rsvp-join-confirm"
                disabled={rsvp.isPending}
                onClick={() => void handleConfirmJoinRsvp()}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
              >
                {rsvp.isPending ? 'Saving…' : 'Count me in'}
              </button>
            </div>
          </Modal>
          {iAmIn && (
            <button
              type="button"
              data-e2e="meetup-join"
              disabled={!joinable || startCall.isPending || joinCall.isPending}
              onClick={() => setPreJoin(true)}
              className="mt-3 min-h-[48px] w-full rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
            >
              Join Meetup
            </button>
          )}
          {iAmIn && !joinable && (
            <p className="mt-1.5 text-center text-xs text-on-surface-variant">
              Join opens {MEETUP_JOIN_LEAD_MS / 60000} minutes before it starts. We’ll remind you.
            </p>
          )}
        </div>
        <PreJoinDialog
          open={preJoin}
          mic={micOnJoin}
          camera={cameraOnJoin}
          pending={startCall.isPending || joinCall.isPending}
          onMicChange={setMicOnJoin}
          onCameraChange={setCameraOnJoin}
          onJoin={() => void handleConfirmJoin()}
          onClose={() => setPreJoin(false)}
        />
        <Suspense fallback={null}>
          {inCall && overlayCallId && (
            <CallOverlay
              callId={overlayCallId}
              micOnJoin={micOnJoin}
              videoOnJoin={cameraOnJoin}
              startedAt={overlayStartedAt}
              expiresAt={(activeCall.data as { expires_at?: string } | undefined)?.expires_at ?? new Date(Date.now() + 30 * 60_000).toISOString()}
              onHangUp={() => void handleHangUp(overlayCallId)}
            />
          )}
        </Suspense>
      </div>
    )
  }

  const showBallot = !hasVoted || editing

  return (
    <div className="space-y-4">
      <div data-e2e="meetup-quorum" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <h2 className="font-display text-lg font-semibold text-on-surface">
          {showBallot ? 'When should we meet?' : 'Finding a time'}
        </h2>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          {showBallot
            ? editing
              ? 'Choose a new time for the meetup.'
              : 'Choose a time that works for you.'
            : `${votedShown} of ${memberCount} members have voted`}
        </p>
        {editing && meetup.voting_closes_at && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-on-surface-variant">
            <Clock className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
            <span>
              Voting closes in <CountdownTimer deadline={meetup.voting_closes_at} />
            </span>
          </p>
        )}
        {!showBallot && (
          <>
            <div
              className="mt-2 flex flex-wrap items-center gap-1.5"
              role="img"
              aria-label={`${votedShown} of ${memberCount} members have voted`}
            >
              {Array.from({ length: memberCount }, (_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    i < votedShown ? 'bg-primary' : 'bg-outline-variant/50',
                  )}
                />
              ))}
              <span className="ml-2 text-xs tabular-nums text-on-surface-variant">
                {votedShown} / {memberCount}
              </span>
            </div>
            {meetup.voting_closes_at && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-on-surface-variant">
                <Clock className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
                <span>
                  Voting closes in <CountdownTimer deadline={meetup.voting_closes_at} />
                </span>
              </p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
            {error}
          </p>
        )}
        {showBallot ? (
          <>
            <div data-e2e="meetup-vote-form" className="mt-4 space-y-2" role="radiogroup" aria-label="Meetup time slots">
              {detail.slots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={mySlot === s.id}
                  onClick={() => setSelected(s.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                    mySlot === s.id
                      ? 'border-primary bg-primary-container/20'
                      : 'border-outline-variant/60 hover:bg-surface-container',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                      mySlot === s.id ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant',
                    )}
                  >
                    {mySlot === s.id ? (
                      editing ? (
                        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                      ) : (
                        <span className="text-[10px]">●</span>
                      )
                    ) : (
                      ''
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-on-surface">{formatSlotShortDot(s.starts_at)}</span>
                    {!editing && (
                      <span className="block text-xs text-on-surface-variant">Your time: {new Date(s.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-on-surface-variant">
                    {s.vote_count} {s.vote_count === 1 ? 'vote' : 'votes'}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">Times are shown in your local time.</p>
            <button
              type="button"
              disabled={!mySlot || vote.isPending}
              onClick={() => void handleVote()}
              className="mt-4 min-h-[48px] w-full rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
            >
              {vote.isPending ? 'Saving…' : editing ? 'Update my vote' : hasVoted ? 'Submit change' : 'Submit vote'}
            </button>
            {hasVoted && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setSelected(null)
                }}
                className="mt-1 min-h-[44px] w-full px-5 py-2.5 text-center text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
              >
                Keep my current vote
              </button>
            )}
          </>
        ) : (
          <>
            <div className="mt-4 space-y-2" aria-label="Vote results so far">
              {detail.slots.map((s) => {
                const isMine = s.id === detail.my_slot_id
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'rounded-xl border px-3.5 py-3',
                      isMine ? 'border-primary bg-primary-container/20' : 'border-outline-variant/60',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-on-surface">
                          {formatSlotShortDot(s.starts_at)}
                          {isMine && (
                            <span className="ml-2 inline-block rounded-pill bg-primary px-2 py-0.5 align-middle text-[11px] font-semibold text-on-primary">
                              Your pick
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-on-surface-variant">
                          {s.vote_count} {s.vote_count === 1 ? 'vote' : 'votes'}
                        </span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-sm text-on-surface-variant">
              <Users className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
              <span>A meetup is set when {quorum} people choose the same time.</span>
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-pill border border-outline-variant/60 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
              >
                Change my vote
              </button>
              <Link
                to={`/cluster/${clusterId}`}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
              >
                Back to room
              </Link>
            </div>
          </>
        )}
        {showBallot && !editing && meetup.voting_closes_at && (
          <p className="mt-3 text-xs text-on-surface-variant">
            Voting closes in <CountdownTimer deadline={meetup.voting_closes_at} />
          </p>
        )}
        {isCreator && !editing && (
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className="mt-2 min-h-[44px] w-full rounded-pill px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            Withdraw proposal
          </button>
        )}
      </div>
      <Modal open={cancelOpen && isCreator} onClose={() => setCancelOpen(false)} title="Withdraw proposal">
        <p className="pt-2 text-sm text-on-surface-variant">This removes your proposal before anyone else confirms it.</p>
        <button
          type="button"
          disabled={cancel.isPending}
          onClick={() => cancel.mutateAsync().then(() => setCancelOpen(false)).catch((e: unknown) => setError(toErrorMessage(e, 'Could not withdraw the proposal')))}
          className="mt-4 min-h-[48px] w-full rounded-pill bg-error px-5 py-3 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {cancel.isPending ? 'Withdrawing…' : 'Withdraw proposal'}
        </button>
      </Modal>
    </div>
  )
}

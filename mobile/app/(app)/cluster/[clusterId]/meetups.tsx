import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { CalendarDays, Check, Clock, Users } from 'lucide-react-native'
import { useAuth } from '../../../../src/auth-context'
import { useClusterMembers } from '../../../../src/features/matching'
import { useClusterChannel } from '../../../../src/features/realtime'
import { useActiveCall, useJoinCall, useStartCall } from '../../../../src/features/cluster-calls'
import {
  useCancelMeetup,
  useCheckInMeetup,
  useClusterMeetups,
  useMeetupState,
  useRsvpMeetup,
  useVoteMeetupSlot,
  type Meetup,
} from '../../../../src/features/meetups'
import { Modal } from '../../../../src/components/Modal'
import { CountdownTimer } from '../../../../src/components/CountdownTimer'
import { ClusterSectionHeader } from '../../../../src/components/ClusterMenu'
import { mutateWithRetry } from '../../../../src/lib/mutate-retry'
import { toErrorMessage } from '../../../../src/lib/error'
import { errorHaptic, successHaptic } from '../../../../src/lib/haptics'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { Card, ErrorText, LoadingView, PrimaryButton, Screen, SecondaryButton } from '../../../../src/components/ui'
import { Avatar } from '../../../../src/components/Avatar'
import { CreatedPendingGate } from '../../../../src/components/created/CreatedPendingGate'
import { usePullToRefresh } from '../../../../src/lib/use-pull-to-refresh'
import { getSuppressedPushCluster, setSuppressedPushCluster } from '../../../../src/lib/push-suppress'
import { MEETUP_ENABLED, MEETUP_JOIN_LEAD_MS, MEETUP_QUORUM, canJoinMeetup, formatSlotCompact24, hasEnded, hasStarted, isLive, pluralize } from '../../../../src/lib/meetup'

const ACTIVE_STATUSES = ['proposed', 'voting', 'confirmed', 'starting', 'active']

export default function MeetupsScreen() {
  const t = useTheme()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const id = MEETUP_ENABLED ? clusterId || null : null

  const meetups = useClusterMeetups(id)
  const members = useClusterMembers(id)
  useClusterChannel(id)
  useFocusEffect(
    useCallback(() => {
      setSuppressedPushCluster(clusterId || null)
      return () => {
        if (getSuppressedPushCluster() === (clusterId || null)) setSuppressedPushCluster(null)
      }
    }, [clusterId]),
  )
  const pull = usePullToRefresh([() => meetups.refetch(), () => members.refetch()])

  const active = useMemo(() => (meetups.data ?? []).find((m) => ACTIVE_STATUSES.includes(m.status)) ?? null, [meetups.data])
  const latest = (meetups.data ?? [])[0] ?? null
  const lastDone = useMemo(() => (meetups.data ?? []).find((m) => m.status === 'completed') ?? null, [meetups.data])

  return (
    <Screen refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      <ClusterSectionHeader title="Meetups" clusterId={clusterId} section="meetups" />
      <ErrorText message={pull.error} />
      {meetups.isPending || members.isPending ? (
        <LoadingView label="Loading meetups…" />
      ) : meetups.isError ? (
        <ErrorText message="Could not load meetups. Pull to refresh." />
      ) : !active ? (
        <View style={{ gap: 16 }}>
          {latest?.status === 'cancelled' && latest.cancelled_reason !== 'withdrawn' ? (
            <Card>
              <Text style={{ fontSize: 18, lineHeight: 26, fontWeight: '600', color: t.onSurface, textAlign: 'center' }}>
                This meetup expired
              </Text>
              <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, textAlign: 'center' }}>
                Fewer than {MEETUP_QUORUM} people voted in time. Propose a new time below.
              </Text>
            </Card>
          ) : lastDone ? (
            <Card>
              <Text style={{ fontSize: 18, lineHeight: 26, fontWeight: '600', color: t.onSurface }}>You met this week</Text>
              <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
                Thanks for joining your Cluster Meetup.
              </Text>
            </Card>
          ) : null}
          <ProposeCard clusterId={clusterId} />
        </View>
      ) : (
        <MeetupDetail key={active.id} clusterId={clusterId} meetup={active} members={(members.data ?? [])} />
      )}
    </Screen>
  )
}

function ProposeCard({ clusterId }: { clusterId: string }) {
  const t = useTheme()

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: radii.lg, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
          <CalendarDays size={24} color={t.onPrimary} strokeWidth={1.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, lineHeight: 26, fontWeight: '600', color: t.onSurface }}>Cluster Meetup</Text>
          <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>Meet the people behind the messages.</Text>
        </View>
      </View>
      <Text style={{ marginTop: 16, fontSize: 14, lineHeight: 20, color: t.onSurface }}>
        Pick a few times for a casual group call this week.
      </Text>
      <View style={{ marginTop: 12 }}>
        <PrimaryButton
          title="Propose a time"
          onPress={() => router.push({ pathname: '/cluster/[clusterId]/meetups/new', params: { clusterId } })}
        />
      </View>
    </Card>
  )
}

function MeetupDetail({
  clusterId,
  meetup,
  members,
}: {
  clusterId: string
  meetup: Meetup
  members: Array<{ id: string; display_name: string | null; avatar_url: string | null }>
}) {
  const memberCount = members.length
  const t = useTheme()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const state = useMeetupState(meetup.id)
  const vote = useVoteMeetupSlot(clusterId, meetup.id)
  const cancel = useCancelMeetup(clusterId, meetup.id)
  const checkIn = useCheckInMeetup(clusterId, meetup.id)
  const rsvp = useRsvpMeetup(clusterId, meetup.id)
  const startCall = useStartCall(clusterId)
  const joinCall = useJoinCall(clusterId)
  const activeCall = useActiveCall(clusterId)

  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joining, setJoining] = useState(false)
  useEffect(() => {
    setSelected(null)
  }, [meetup.id])

  if (state.isPending) return <LoadingView label="Loading meetup…" />
  if (state.isError || !state.data) return <ErrorText message="Could not load this meetup." />
  const detail = state.data
  const row = detail.meetup
  const mySlot = selected ?? detail.my_slot_id
  const joinable = row.starts_at ? canJoinMeetup(row.starts_at) : false
  const endsValid = row.ends_at ? !Number.isNaN(new Date(row.ends_at).getTime()) : false
  const live = isLive(row.starts_at, row.ends_at) || (hasStarted(row.starts_at) && !endsValid && canJoinMeetup(row.starts_at))
  const isCreator = userId !== null && row.created_by === userId
  const hasVoted = detail.my_slot_id !== null
  const showBallot = !hasVoted || editing
  const votedShown = Math.max(0, Math.min(detail.votes_cast, memberCount))
  const quorum = detail.quorum ?? MEETUP_QUORUM

  async function handleVote() {
    if (!mySlot) return
    setError(null)
    try {
      await mutateWithRetry(() => vote.mutateAsync(mySlot))
      successHaptic()
      setSelected(null)
      setEditing(false)
    } catch (err) {
      errorHaptic()
      setError(toErrorMessage(err, 'Could not submit your vote'))
    }
  }

  function startEditing() {
    setSelected(detail.my_slot_id)
    setEditing(true)
  }

  async function handleJoin() {
    setError(null)
    setJoining(true)
    try {
      const callId = activeCall.data?.id ?? (await mutateWithRetry(() => startCall.mutateAsync()))
      if (activeCall.data?.id) await mutateWithRetry(() => joinCall.mutateAsync(activeCall.data!.id))
      try {
        await checkIn.mutateAsync()
      } catch {
        // Attendance is best-effort; the call join already succeeded.
      }
      successHaptic()
      router.push({ pathname: '/cluster/[clusterId]/call', params: { clusterId, callId } })
    } catch (e) {
      errorHaptic()
      setError(toErrorMessage(e, 'Could not join the meetup. Try again.'))
    } finally {
      setJoining(false)
    }
  }

  if (row.status === 'completed') {
    return (
      <View style={{ gap: 16 }}>
        <Card>
          <Text style={{ fontSize: 18, lineHeight: 26, fontWeight: '600', color: t.onSurface, textAlign: 'center' }}>You met this week</Text>
          <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, textAlign: 'center' }}>
            {pluralize(detail.checked_in_count, 'member', 'members')} joined your Cluster Meetup.
          </Text>
          <View style={{ marginTop: 12 }}>
            <PrimaryButton title="Propose a time for next week" onPress={() => router.push({ pathname: '/cluster/[clusterId]/meetups/new', params: { clusterId } })} />
          </View>
        </Card>
      </View>
    )
  }

  if (row.status === 'confirmed' || row.status === 'starting' || row.status === 'active') {
    // propose stays hidden here: create_meetup rejects with meetup_active
    // until expire_meetups completes this row, then the propose card appears.
    // Stay on the live card while a call may still be up: a live cluster
    // call (other screen/device) or an open rejoin window.
    if (hasEnded(row.ends_at) && !activeCall.data?.id && !canJoinMeetup(row.starts_at)) {
      return (
        <View style={{ gap: 16 }}>
          <Card>
            <View style={{ alignItems: 'center' }}>
              <CalendarDays size={30} color={t.primary} strokeWidth={1.5} />
            </View>
            <Text style={{ marginTop: 10, fontSize: 18, lineHeight: 26, fontWeight: '600', color: t.onSurface, textAlign: 'center' }}>You met this week</Text>
            <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, textAlign: 'center' }}>
              {pluralize(detail.checked_in_count, 'member', 'members')} joined your Cluster Meetup.
            </Text>
            <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, textAlign: 'center' }}>
              This meetup has ended.
            </Text>
          </Card>
        </View>
      )
    }
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
        : (row.confirmed_slot_id ? detail.voters.filter((v) => v.slot_id === row.confirmed_slot_id) : []).map(
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
        await mutateWithRetry(() => rsvp.mutateAsync('going'))
        successHaptic()
        setJoinOpen(false)
      } catch (e) {
        errorHaptic()
        setJoinOpen(false)
        setError(toErrorMessage(e, 'Could not update your RSVP. Try again.'))
      }
    }

    async function handleConfirmDecline() {
      setError(null)
      try {
        await mutateWithRetry(() => rsvp.mutateAsync('declined'))
        successHaptic()
        setDeclineOpen(false)
      } catch (e) {
        errorHaptic()
        setDeclineOpen(false)
        setError(toErrorMessage(e, 'Could not update your RSVP. Try again.'))
      }
    }

    return (
      <View style={{ gap: 16 }}>
        <Card>
          <View style={{ alignItems: 'center' }}>
            <CalendarDays size={30} color={t.primary} strokeWidth={1.5} />
          </View>
          <Text style={{ marginTop: 10, fontSize: 18, lineHeight: 26, fontWeight: '600', color: t.onSurface, textAlign: 'center' }}>Your cluster meetup is set</Text>
          <Text style={{ marginTop: 6, fontSize: 22, lineHeight: 30, fontWeight: '700', color: t.onSurface, textAlign: 'center' }}>
            {row.starts_at ? formatSlotCompact24(row.starts_at) : ''}
          </Text>
          {shownJoining.length > 0 ? (
            <View
              style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              accessibilityRole="image"
              accessibilityLabel={pluralize(joiningCount, 'member joining', 'members joining')}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {shownJoining.map((m, i) => (
                  <View
                    key={m.id}
                    style={{
                      marginLeft: i === 0 ? 0 : -8,
                      borderWidth: 2,
                      borderColor: t.surface,
                      borderRadius: 16,
                    }}
                  >
                    <Avatar name={m.display_name ?? ''} src={m.avatar_url} size={28} />
                  </View>
                ))}
                {joiningOverflow > 0 ? (
                  <View
                    style={{
                      marginLeft: -8,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: t.surfaceContainer,
                      borderWidth: 2,
                      borderColor: t.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                      +{joiningOverflow}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
          <Text style={{ marginTop: 3, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, textAlign: 'center' }}>
            {pluralize(joiningCount, 'member joining', 'members joining')}
          </Text>
          {live ? (
            <View style={{ marginTop: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Clock size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
              <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
                <Text style={{ fontWeight: '600', color: t.primary }}>Live now</Text>
                {row.ends_at ? ` - ends ${new Date(row.ends_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}
              </Text>
            </View>
          ) : row.starts_at && !hasStarted(row.starts_at) ? (
            <View style={{ marginTop: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Clock size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
              <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
                Starts in <CountdownTimer deadline={row.starts_at} />
              </Text>
            </View>
          ) : null}
          {row.starts_at ? (
            <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant, textAlign: 'center' }}>
              Times are shown in your local time.
            </Text>
          ) : null}
          <ErrorText message={error} />
          {!iAmIn ? (
            hasVoted ? (
              <View style={{ marginTop: 10 }}>
                <PrimaryButton title="Count me in" loading={rsvp.isPending} onPress={() => setJoinOpen(true)} />
              </View>
            ) : (
              <View style={{ marginTop: 10, gap: 8, backgroundColor: t.surfaceContainer, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.lg, padding: 10 }}>
                <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurface, textAlign: 'center' }}>
                  {"Didn't vote? You can still join us."}
                </Text>
                <PrimaryButton title="Count me in" loading={rsvp.isPending} onPress={() => setJoinOpen(true)} />
              </View>
            )
          ) : hasStarted(row.starts_at) ? null : (
            <View style={{ marginTop: 8, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                disabled={rsvp.isPending}
                hitSlop={8}
                onPress={() => setDeclineOpen(true)}
                style={{ minHeight: 44, justifyContent: 'center', opacity: rsvp.isPending ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.primary, textAlign: 'center', textDecorationLine: 'underline' }}>
                  I can’t make it
                </Text>
              </Pressable>
            </View>
          )}
          <Modal open={declineOpen} onClose={() => setDeclineOpen(false)} title="Can’t make it?">
            <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, textAlign: 'center' }}>
              You’ll be removed from the meetup. The meetup time won’t change.
            </Text>
            <View style={{ marginTop: 16, gap: 8 }}>
              <PrimaryButton title="I can’t make it" tone="error" loading={rsvp.isPending} onPress={() => void handleConfirmDecline()} />
              <SecondaryButton title="Keep me in" onPress={() => setDeclineOpen(false)} />
            </View>
          </Modal>
          <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Count me in?">
            <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant, textAlign: 'center' }}>
              You’ll be added to the meetup. We’ll remind you before it starts.
            </Text>
            <View style={{ marginTop: 16, gap: 8 }}>
              <PrimaryButton title="Count me in" loading={rsvp.isPending} onPress={() => void handleConfirmJoinRsvp()} />
              <SecondaryButton title="Cancel" onPress={() => setJoinOpen(false)} />
            </View>
          </Modal>
          {iAmIn ? (
            <View style={{ marginTop: 10 }}>
              <PrimaryButton title="Join Meetup" loading={joining} disabled={!joinable} onPress={() => void handleJoin()} />
            </View>
          ) : null}
          {!joinable && iAmIn ? (
            <View>
              <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant, textAlign: 'center' }}>
                Join opens {MEETUP_JOIN_LEAD_MS / 60000} minutes before it starts.
              </Text>
              <Text style={{ marginTop: 2, fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant, textAlign: 'center' }}>
                We’ll remind you.
              </Text>
            </View>
          ) : null}
        </Card>
      </View>
    )
  }

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Text style={{ fontSize: 18, lineHeight: 26, fontWeight: '600', color: t.onSurface }}>
          {showBallot ? 'When should we meet?' : 'Finding a time'}
        </Text>
        <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
          {showBallot
            ? editing
              ? 'Choose a new time for the meetup.'
              : 'Choose a time that works for you.'
            : `${votedShown} of ${memberCount} members have voted`}
        </Text>
        {editing && row.voting_closes_at ? (
          <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Clock size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
            <Text style={{ flex: 1, flexShrink: 1, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
              Voting closes in <CountdownTimer deadline={row.voting_closes_at} />
            </Text>
          </View>
        ) : null}
        {!showBallot ? (
          <>
            <View
              style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}
              accessibilityRole="image"
              accessibilityLabel={`${votedShown} of ${memberCount} members have voted`}
            >
              {Array.from({ length: memberCount }, (_, i) => (
                <View
                  key={i}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: i < votedShown ? t.primary : t.outlineVariant,
                    opacity: i < votedShown ? 1 : 0.5,
                  }}
                />
              ))}
              <Text style={{ marginLeft: 8, fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant, fontVariant: ['tabular-nums'] }}>
                {votedShown} / {memberCount}
              </Text>
            </View>
            {row.voting_closes_at ? (
              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Clock size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <Text style={{ flex: 1, flexShrink: 1, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
                  Voting closes in <CountdownTimer deadline={row.voting_closes_at} />
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
        <ErrorText message={error} />
        {showBallot ? (
          <>
            <View style={{ marginTop: 12, gap: 8 }}>
              {detail.slots.map((s) => {
                const activeSlot = mySlot === s.id
                return (
                  <Pressable
                    key={s.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: activeSlot }}
                    onPress={() => setSelected(s.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      borderWidth: 1,
                      borderColor: activeSlot ? t.primary : t.outlineVariant,
                      // 20% primaryContainer tint, mirroring web bg-primary-container/20.
                      // A solid fill turns the whole card terracotta in light mode.
                      backgroundColor: activeSlot ? `${t.primaryContainer}33` : 'transparent',
                      borderRadius: radii.md,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      minHeight: 48,
                    }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: activeSlot ? t.primary : t.outlineVariant,
                        backgroundColor: activeSlot ? t.primary : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {activeSlot ? (
                        editing ? (
                          <Check size={12} color={t.onPrimary} strokeWidth={3} />
                        ) : (
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.onPrimary }} />
                        )
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.onSurface }}>{formatSlotCompact24(s.starts_at)}</Text>
                      {!editing ? (
                        <Text style={{ fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant }}>
                          Your time: {new Date(s.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </Text>
                      ) : null}
                      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.onSurfaceVariant }}>
                        {s.vote_count} {s.vote_count === 1 ? 'vote' : 'votes'}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
            <Text style={{ marginTop: 8, fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant }}>
              Times are shown in your local time.
            </Text>
            <View style={{ marginTop: 12 }}>
              <PrimaryButton
                title={editing ? 'Update my vote' : hasVoted ? 'Submit change' : 'Submit vote'}
                loading={vote.isPending}
                disabled={!mySlot}
                onPress={() => void handleVote()}
              />
            </View>
            {hasVoted ? (
              <View style={{ marginTop: 8 }}>
                <SecondaryButton
                  title="Keep my current vote"
                  onPress={() => {
                    setEditing(false)
                    setSelected(null)
                  }}
                />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={{ marginTop: 12, gap: 8 }}>
              {detail.slots.map((s) => {
                const isMine = s.id === detail.my_slot_id
                return (
                  <View
                    key={s.id}
                    style={{
                      borderWidth: 1,
                      borderColor: isMine ? t.primary : t.outlineVariant,
                      backgroundColor: isMine ? `${t.primaryContainer}33` : 'transparent',
                      borderRadius: radii.md,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                    }}
                  >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.onSurface, flexShrink: 1 }} numberOfLines={1}>
                              {formatSlotCompact24(s.starts_at)}
                            </Text>
                            {isMine ? (
                              <View style={{ flexShrink: 0, backgroundColor: t.primary, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                                <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: t.onPrimary }}>
                                  Your pick
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={{ fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant }}>
                            {s.vote_count} {s.vote_count === 1 ? 'vote' : 'votes'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )
                })}
              </View>
            <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ marginTop: 2 }}>
                <Users size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
              </View>
              <Text style={{ flex: 1, flexShrink: 1, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
                A meetup is set when {quorum} people choose the same time.
              </Text>
            </View>
            <View style={{ marginTop: 12, gap: 8 }}>
              <SecondaryButton title="Change my vote" onPress={startEditing} />
              <PrimaryButton
                title="Back to room"
                onPress={() => router.push({ pathname: '/cluster/[clusterId]/room', params: { clusterId } })}
              />
              </View>
          </>
        )}
        {showBallot && !editing && row.voting_closes_at ? (
          <Text style={{ marginTop: 12, fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant }}>
            Voting closes in <CountdownTimer deadline={row.voting_closes_at} />
          </Text>
        ) : null}
        {isCreator && !editing && <CancelRow clusterId={clusterId} meetupId={row.id} onError={setError} />}
      </Card>
    </View>
  )
}

function CancelRow({ clusterId, meetupId, onError }: { clusterId: string; meetupId: string; onError: (m: string | null) => void }) {
  const cancel = useCancelMeetup(clusterId, meetupId)
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <View style={{ marginTop: 8 }}>
        <SecondaryButton title="Withdraw proposal" onPress={() => setConfirming(true)} />
      </View>
    )
  }
  return (
    <View style={{ marginTop: 8, gap: 8 }}>
      <PrimaryButton
        title="Confirm withdraw"
        tone="error"
        loading={cancel.isPending}
        onPress={() =>
          void mutateWithRetry(() => cancel.mutateAsync())
            .then(() => successHaptic())
            .catch((e: unknown) => {
              errorHaptic()
              onError(toErrorMessage(e, 'Could not withdraw the proposal'))
            })
        }
      />
      <SecondaryButton title="Keep proposal" onPress={() => setConfirming(false)} />
    </View>
  )
}



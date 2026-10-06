import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Loader2, MapPin } from 'lucide-react'
import { useAuth } from '../../app/auth-context'
import { CLUSTER_SIZE } from '../../lib/constants'
import type { MatchingMode } from '../../lib/modes'
import { humanizeAreaSlug, localQueueKey, type LocalRadius } from '../onboarding/draft'
import { RadiusPicker } from '../../components/RadiusPicker'
import { getCurrentPosition, reverseGeocode } from '../../lib/geo'
import { requireSupabase } from '../../lib/supabase'
import { joinQueueErrorMessage, toErrorMessage } from '../../lib/error'
import { useQueryClient } from '@tanstack/react-query'
import { useMyQueueStatus, useJoinQueue, useQueueCount } from '../../features/matching'
import { Modal } from '../../components/Modal'
import { WhatsNextSteps } from '../../components/WhatsNextSteps'
import { profileKey, useProfile, type Profile } from '../../lib/use-profile'

/** The per-mode queue/join panel shown on a discovery mode page. */
export function ModePanel({ mode }: { mode: MatchingMode }) {
  const status = useMyQueueStatus()
  const row = status.data?.find((r) => r.mode === mode)
  const [editingLocal, setEditingLocal] = useState(false)
  const profile = useProfile()
  const hasLocalLocation =
    !!profile.data?.local_area && profile.data?.local_radius_km != null

  let body: ReactNode
  if (status.isLoading || (mode === 'local' && profile.isLoading)) {
    body = (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    )
  } else if (!row) {
    body = <div className="text-sm text-on-surface-variant">This mode isn’t available yet.</div>
  } else if (row.cluster_id) {
    body = <InClusterCard clusterId={row.cluster_id} />
  } else if (
    mode === 'local' &&
    (!row.queue_key || editingLocal || (!row.joined && !hasLocalLocation))
  ) {
    body = <LocalSetupCard onDone={editingLocal ? () => setEditingLocal(false) : undefined} />
  } else if (row.joined) {
    body = (
      <JoinedCard
        mode={mode}
        queueKey={row.queue_key}
        label={row.label}
        onEditLocation={mode === 'local' ? () => setEditingLocal(true) : undefined}
      />
    )
  } else {
    body = (
      <JoinCard
        mode={mode}
        queueKey={row.queue_key}
        label={row.label}
        waiting={row.waiting}
        onEditLocation={mode === 'local' ? () => setEditingLocal(true) : undefined}
      />
    )
  }

  return (
    <section aria-label="Your queue">
      {body}
    </section>
  )
}

function InClusterCard({ clusterId }: { clusterId: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/60 bg-surface p-6 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        You’re already matched
      </p>
      <h2 className="mt-1 font-display text-xl font-semibold text-on-surface">
        You’re already in an active cluster
      </h2>
      <p className="mt-3 text-sm leading-6 text-on-surface-variant">
        This matching mode is full for you while your cluster is active. Head back to your room to keep the conversation going.
      </p>
      <Link
        to={`/cluster/${clusterId}`}
        className="mt-5 inline-flex items-center gap-2 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
      >
        Open your cluster <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}

function JoinCard({
  mode,
  queueKey,
  label,
  waiting,
  onEditLocation,
}: {
  mode: MatchingMode
  queueKey: string
  label: string | null
  waiting: number
  onEditLocation?: () => void
}) {
  const join = useJoinQueue()
  const live = useQueueCount(mode, queueKey)
  const count = live.count ?? waiting
  const profile = useProfile()
  const displayKey = mode === 'open_mix' ? 'Open pool' : mode === 'local' && label ? label : queueKey
  const displayBlurb =
    mode === 'open_mix'
      ? 'Join and you’ll be grouped with the next 7 people in line, whoever they are.'
      : 'Join this queue and you’ll be grouped with 7 people sharing this match.'

  return (
    <div className="rounded-2xl border border-outline-variant/60 bg-surface p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Waiting in queue
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-on-surface">{displayKey}</h2>
        </div>
        <span className="rounded-pill bg-surface-container px-3 py-1.5 text-sm font-semibold text-on-surface-variant">
          {count} of {CLUSTER_SIZE} ready
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-on-surface-variant">{displayBlurb}</p>
      <WhatsNextSteps className="mt-4" />
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={() =>
            join
              .mutateAsync({ mode, radiusKm: profile.data?.local_radius_km ?? undefined })
              .catch(() => undefined)
          }
          disabled={join.isPending}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60 sm:w-auto"
        >
          {join.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {join.isPending ? 'Joining…' : 'Join this queue'}
        </button>
        {onEditLocation && (
          <button
            type="button"
            onClick={onEditLocation}
            className="inline-flex min-h-[44px] w-full items-center justify-center py-2 text-center text-sm font-semibold text-primary hover:underline sm:w-auto sm:justify-start sm:text-left"
          >
            Update my location
          </button>
        )}
      </div>
      {join.isError && (
        <p role="alert" className="mt-3 text-sm text-error">
          {joinQueueErrorMessage(join.error, mode)}
        </p>
      )}
    </div>
  )
}

function JoinedCard({
  mode,
  queueKey,
  label,
  onEditLocation,
}: {
  mode: MatchingMode
  queueKey: string
  label: string | null
  onEditLocation?: () => void
}) {
  const live = useQueueCount(mode, queueKey)
  const count = live.count ?? 0
  const displayKey = mode === 'open_mix' ? 'Open pool' : mode === 'local' && label ? label : queueKey

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary-container/10 p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">You’re queued</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-on-surface">{displayKey}</h2>
        </div>
        <span className="rounded-pill bg-surface-container px-3 py-1.5 text-sm font-semibold text-on-surface-variant">
          {count} of {CLUSTER_SIZE}
        </span>
      </div>
      <WhatsNextSteps compact className="mt-4" />
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          to={`/queue/${mode}`}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          View queue <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      {onEditLocation && (
        <button
          type="button"
          onClick={onEditLocation}
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center py-2 text-center text-sm font-semibold text-primary hover:underline sm:w-auto sm:justify-start sm:text-left"
        >
          Update my location
        </button>
      )}
    </div>
  )
}

function LocalSetupCard({ onDone }: { onDone?: () => void }) {
  const auth = useAuth()
  const status = useMyQueueStatus()
  const profile = useProfile()
  const queryClient = useQueryClient()
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [radius, setRadius] = useState<LocalRadius | null>(
    (profile.data?.local_radius_km as LocalRadius | null) ?? null,
  )
  const [pendingRadius, setPendingRadius] = useState<LocalRadius | null>(null)
  const [joining, setJoining] = useState(false)
  const [pendingLeave, setPendingLeave] = useState<LocalRadius | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [place, setPlace] = useState<{ slug: string; label: string; countryCode: string | null } | null>(null)
  const hasArea = !!profile.data?.local_area

  const areaSlug = place?.slug ?? profile.data?.local_area ?? null
  const countryForKey =
    place?.countryCode ?? profile.data?.local_country_code ?? profile.data?.country_code ?? null
  const count10 = useQueueCount(
    'local',
    areaSlug ? localQueueKey(countryForKey, areaSlug, 10) : null,
  )
  const count50 = useQueueCount(
    'local',
    areaSlug ? localQueueKey(countryForKey, areaSlug, 50) : null,
  )
  const count100 = useQueueCount(
    'local',
    areaSlug ? localQueueKey(countryForKey, areaSlug, 100) : null,
  )
  const counts = areaSlug
    ? { 10: count10.count, 50: count50.count, 100: count100.count }
    : undefined
  const pendingCount = pendingRadius != null ? (counts?.[pendingRadius] ?? null) : null
  const savedAreaLabel = profile.data?.local_area ? humanizeAreaSlug(profile.data.local_area) : null
  const dialogAreaLabel = place?.label ?? savedAreaLabel ?? 'your area'
  const queuedLocalKey =
    status.data?.find((r) => r.mode === 'local' && r.joined)?.queue_key ?? null

  function onPickRadius(next: LocalRadius) {
    setDialogError(null)
    const key = areaSlug ? localQueueKey(countryForKey, areaSlug, next) : null
    if (queuedLocalKey != null && key != null && queuedLocalKey === key) {
      setPendingLeave(next)
    } else {
      setPendingRadius(next)
    }
  }

  useEffect(() => {
    const saved = profile.data?.local_radius_km
    if (saved != null) setRadius(saved as LocalRadius)
  }, [profile.data?.local_radius_km])

  async function locate() {
    setLocating(true)
    setError(null)
    try {
      const coords = await getCurrentPosition()
      const found = await reverseGeocode(coords)
      if (auth.state === 'signedIn') {
        setSaving(true)
        const supabase = requireSupabase()
        const inLocalQueue = status.data?.find((r) => r.mode === 'local' && r.joined)
        if (inLocalQueue) {
          const { error: leaveErr } = await supabase.rpc('leave_queue', { p_mode: 'local' })
          if (leaveErr) throw leaveErr
        }
        const { error: upErr } = await supabase
          .from('profiles')
          .update({
            latitude: coords.lat,
            longitude: coords.lng,
            local_area: found.slug,
            local_country_code: found.countryCode,
          })
          .eq('id', auth.userId)
        if (upErr) throw upErr
        {
          const uid = auth.userId
          queryClient.setQueryData(profileKey(uid), (old: Profile | null | undefined) =>
            old
              ? {
                  ...old,
                  latitude: coords.lat,
                  longitude: coords.lng,
                  local_area: found.slug,
                  local_country_code: found.countryCode,
                }
              : old,
          )
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: profileKey(uid) }),
            queryClient.invalidateQueries({ queryKey: ['my-queues', uid] }),
            queryClient.invalidateQueries({ queryKey: ['matching-status', uid] }),
            queryClient.invalidateQueries({ queryKey: ['queue-count'] }),
          ])
        }
        setPlace(found)
      }
    } catch (err) {
      setError(toErrorMessage(err, 'Couldn’t determine your location.'))
    } finally {
      setLocating(false)
      setSaving(false)
    }
  }

  async function confirmRadiusJoin() {
    const next = pendingRadius
    if (auth.state !== 'signedIn' || next == null) return
    setDialogError(null)
    setJoining(true)
    const prevRadius = profile.data?.local_radius_km ?? null
    try {
      const supabase = requireSupabase()
      // join_queue validates first and re-keys the local queue itself, so no
      // explicit leave: a failed join keeps the previous queue spot instead
      // of stranding the user queue-less (e.g. under a mode cooldown).
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ local_radius_km: next })
        .eq('id', auth.userId)
      if (upErr) throw upErr
      const { error: joinErr } = await supabase.rpc('join_queue', {
        p_mode: 'local',
        p_radius_km: next,
      })
      if (joinErr) throw joinErr
      setRadius(next)
      {
        const uid = auth.userId
        queryClient.setQueryData(profileKey(uid), (old: Profile | null | undefined) =>
          old ? { ...old, local_radius_km: next } : old,
        )
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: profileKey(uid) }),
          queryClient.invalidateQueries({ queryKey: ['my-queues', uid] }),
          queryClient.invalidateQueries({ queryKey: ['matching-status', uid] }),
          queryClient.invalidateQueries({ queryKey: ['queue-count'] }),
        ])
      }
      setPendingRadius(null)
      onDone?.()
    } catch (err) {
      // Best-effort restore: the radius flip must not stick when the join failed.
      try {
        const supabase = requireSupabase()
        await supabase.from('profiles').update({ local_radius_km: prevRadius }).eq('id', auth.userId)
      } catch {
        // Ignore restore failures; the next locate or join overwrites it.
      }
      setDialogError(joinQueueErrorMessage(err, 'local'))
    } finally {
      setJoining(false)
    }
  }

  function closeRadiusDialog() {
    if (!joining) {
      setPendingRadius(null)
      setDialogError(null)
    }
  }

  async function confirmRadiusLeave() {
    if (auth.state !== 'signedIn' || pendingLeave == null) return
    setDialogError(null)
    setLeaving(true)
    try {
      const supabase = requireSupabase()
      const { error: leaveErr } = await supabase.rpc('leave_queue', { p_mode: 'local' })
      if (leaveErr) throw leaveErr
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ local_radius_km: null })
        .eq('id', auth.userId)
      if (upErr) throw upErr
      setRadius(null)
      {
        const uid = auth.userId
        queryClient.setQueryData(profileKey(uid), (old: Profile | null | undefined) =>
          old ? { ...old, local_radius_km: null } : old,
        )
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: profileKey(uid) }),
          queryClient.invalidateQueries({ queryKey: ['my-queues', uid] }),
          queryClient.invalidateQueries({ queryKey: ['matching-status', uid] }),
          queryClient.invalidateQueries({ queryKey: ['queue-count'] }),
        ])
      }
      setPendingLeave(null)
    } catch (err) {
      setDialogError(toErrorMessage(err, 'Couldn’t leave this queue.'))
    } finally {
      setLeaving(false)
    }
  }

  function closeLeaveDialog() {
    if (!leaving) {
      setPendingLeave(null)
      setDialogError(null)
    }
  }

  return (
    <div className="rounded-2xl border border-outline-variant/60 bg-surface p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Local matching</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-on-surface">
            {hasArea ? 'Update your local area' : 'Set your local area'}
          </h2>
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-on-surface-variant">
          {hasArea
            ? 'You’ll be matched within your new area. If you were in a queue, join the new one to continue.'
            : 'You haven’t set a local area yet. Share your location once and you’ll be matched within your chosen radius. Your exact coordinates are never shared with cluster members.'}
      </p>

      {(place || hasArea) && (
        <div className="mt-5">
          <RadiusPicker value={radius} onChange={onPickRadius} counts={counts} />
        </div>
      )}
      <Modal
        open={pendingRadius != null}
        onClose={closeRadiusDialog}
        title={pendingRadius != null ? `Join the ${pendingRadius} km queue?` : 'Join queue?'}
      >
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-on-surface-variant">
            {pendingRadius != null
              ? `You’ll be matched within ${pendingRadius} km of ${dialogAreaLabel}${
                  pendingCount != null ? `, where ${pendingCount} of ${CLUSTER_SIZE} are waiting` : ''
                }.`
              : null}
          </p>
          {dialogError && (
            <p role="alert" className="text-sm text-error">
              {dialogError}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={closeRadiusDialog}
              disabled={joining}
              className="min-h-[44px] flex-1 rounded-pill border border-outline-variant/70 px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmRadiusJoin()}
              disabled={joining}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
            >
              {joining && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Join queue
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={pendingLeave != null}
        onClose={closeLeaveDialog}
        title={pendingLeave != null ? `Leave the ${pendingLeave} km queue?` : 'Leave queue?'}
      >
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-on-surface-variant">
            {pendingLeave != null
              ? `You’ll stop waiting within ${pendingLeave} km of ${dialogAreaLabel}. Your radius choice will be cleared, but your area stays saved.`
              : null}
          </p>
          {dialogError && (
            <p role="alert" className="text-sm text-error">
              {dialogError}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={closeLeaveDialog}
              disabled={leaving}
              className="min-h-[44px] flex-1 rounded-pill border border-outline-variant/70 px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmRadiusLeave()}
              disabled={leaving}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-pill bg-error px-5 py-3 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-60"
            >
              {leaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Leave queue
            </button>
          </div>
        </div>
      </Modal>

      {(place || savedAreaLabel) && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm text-on-surface-variant">
            Area:{' '}
            <span className="font-semibold text-on-surface">{place?.label ?? savedAreaLabel}</span>
          </p>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        {!hasArea && (
          <button
            type="button"
            onClick={locate}
            disabled={locating || saving}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {locating || saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <MapPin className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            )}
            {locating ? 'Finding your location…' : saving ? 'Saving…' : 'Share my location'}
          </button>
        )}
        {hasArea && radius != null && (
          <p className="inline-flex min-h-[44px] flex-wrap items-center gap-x-1.5 text-sm text-on-surface-variant">
            Wrong area?
            <button
              type="button"
              onClick={locate}
              disabled={locating || saving}
              className="inline-flex min-h-[44px] items-center justify-center text-sm font-semibold text-primary hover:underline disabled:opacity-60"
            >
              {locating || saving ? 'Locating…' : 'Update location'}
            </button>
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-error">
          {error}
        </p>
      )}
      {hasArea && onDone && (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="inline-flex min-h-[44px] items-center justify-center rounded-pill border border-outline-variant/70 px-5 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

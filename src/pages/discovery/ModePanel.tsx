import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Loader2, MapPin } from 'lucide-react'
import { useAuth } from '../../app/auth-context'
import { cn } from '../../lib/utils'
import { CLUSTER_SIZE } from '../../lib/constants'
import type { MatchingMode } from '../../lib/modes'
import { LOCAL_RADII, type LocalRadius } from '../onboarding/draft'
import { getCurrentPosition, reverseGeocode } from '../../lib/geo'
import { requireSupabase } from '../../lib/supabase'
import { joinQueueErrorMessage, toErrorMessage } from '../../lib/error'
import { useMyQueueStatus, useJoinQueue, useQueueCount } from '../../features/matching'
import { useProfile } from '../../lib/use-profile'

/** The per-mode queue/join panel shown on a discovery mode page. */
export function ModePanel({ mode }: { mode: MatchingMode }) {
  const status = useMyQueueStatus()
  const row = status.data?.find((r) => r.mode === mode)
  const [editingLocal, setEditingLocal] = useState(false)

  let body: ReactNode
  if (status.isLoading) {
    body = (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    )
  } else if (!row) {
    body = <div className="text-sm text-on-surface-variant">This mode isn’t available yet.</div>
  } else if (row.cluster_id) {
    body = <InClusterCard clusterId={row.cluster_id} />
  } else if (mode === 'local' && (row.queue_key === null || editingLocal)) {
    body = <LocalSetupCard onDone={() => setEditingLocal(false)} />
  } else if (row.joined) {
    body = (
      <JoinedCard
        mode={mode}
        queueKey={row.queue_key}
        onEditLocation={mode === 'local' ? () => setEditingLocal(true) : undefined}
      />
    )
  } else {
    body = (
      <JoinCard
        mode={mode}
        queueKey={row.queue_key}
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
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">You’re already matched</p>
      <h2 className="mt-1 font-display text-xl font-semibold text-on-surface">
        You’re already in an active cluster
      </h2>
      <p className="mt-3 text-sm leading-6 text-on-surface-variant">
        This matching mode is full for you while your cluster is active. Head back to your room to
        keep the conversation going.
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
  waiting,
  onEditLocation,
}: {
  mode: MatchingMode
  queueKey: string
  waiting: number
  onEditLocation?: () => void
}) {
  const join = useJoinQueue()
  const live = useQueueCount(mode, queueKey)
  const count = live.count ?? waiting
  const profile = useProfile()

  return (
    <div className="rounded-2xl border border-outline-variant/60 bg-surface p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Waiting in queue
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-on-surface">{queueKey}</h2>
        </div>
        <span className="rounded-pill bg-surface-container px-3 py-1.5 text-sm font-semibold text-on-surface-variant">
          {count} of {CLUSTER_SIZE} ready
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-on-surface-variant">
        Join this queue and you’ll be grouped with 7 strangers sharing this match. Clusters are
        permanent.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={() =>
            join
              .mutateAsync({ mode, radiusKm: profile.data?.local_radius_km ?? undefined })
              .catch(() => undefined)
          }
          disabled={join.isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60 sm:w-auto"
        >
          {join.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {join.isPending ? 'Joining…' : 'Join this queue'}
        </button>
        {onEditLocation && (
          <button
            type="button"
            onClick={onEditLocation}
            className="w-full text-center text-sm font-semibold text-primary hover:underline sm:w-auto sm:text-left"
          >
            Update my location
          </button>
        )}
      </div>
      {join.isError && (
        <p className="mt-3 text-sm text-error">{joinQueueErrorMessage(join.error)}</p>
      )}
    </div>
  )
}

function JoinedCard({
  mode,
  queueKey,
  onEditLocation,
}: {
  mode: MatchingMode
  queueKey: string
  onEditLocation?: () => void
}) {
  const live = useQueueCount(mode, queueKey)
  const count = live.count ?? 0

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary-container/10 p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">You’re queued</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-on-surface">{queueKey}</h2>
        </div>
        <span className="rounded-pill bg-surface-container px-3 py-1.5 text-sm font-semibold text-on-surface-variant">
          {count} of {CLUSTER_SIZE}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          to={`/queue/${mode}`}
          className="inline-flex items-center gap-2 rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          View queue <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      {onEditLocation && (
        <button
          type="button"
          onClick={onEditLocation}
          className="mt-3 w-full text-center text-sm font-semibold text-primary hover:underline sm:w-auto sm:text-left"
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
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [radius, setRadius] = useState<LocalRadius>(50)
  const [place, setPlace] = useState<{ slug: string; label: string } | null>(null)
  const hasArea = !!profile.data?.local_area

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
      setPlace(found)
      if (auth.state === 'signedIn') {
        const supabase = requireSupabase()
        const inLocalQueue = status.data?.find((r) => r.mode === 'local' && r.joined)
        if (inLocalQueue) {
          await supabase.rpc('leave_queue', { p_mode: 'local' })
        }
        const { error: upErr } = await supabase
          .from('profiles')
          .update({
            latitude: coords.lat,
            longitude: coords.lng,
            local_area: found.slug,
            local_radius_km: radius,
          })
          .eq('id', auth.userId)
        if (upErr) throw upErr
        setSaving(true)
        await status.refetch()
      }
      onDone?.()
    } catch (err) {
      setError(toErrorMessage(err, 'Couldn’t determine your location.'))
    } finally {
      setLocating(false)
      setSaving(false)
    }
  }

  async function changeRadius(next: LocalRadius) {
    setRadius(next)
    if (!place || auth.state !== 'signedIn') return
    try {
      const supabase = requireSupabase()
      const { error } = await supabase
        .from('profiles')
        .update({ local_radius_km: next })
        .eq('id', auth.userId)
      if (error) throw error
    } catch (err) {
      setError(toErrorMessage(err, 'Couldn’t update your radius.'))
    }
  }

  if (place && status.data?.find((r) => r.mode === 'local')?.queue_key) {
    return null
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
        {hasArea && onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm font-semibold text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </button>
        )}
      </div>
      <p className="mt-2 text-sm leading-6 text-on-surface-variant">
        {hasArea
          ? 'You’ll be matched within your new area. If you’re currently queued locally, this updates your queue.'
          : 'You haven’t set a local area yet. Share your location once and you’ll be matched within your chosen radius. Your exact coordinates are never shared with cluster members.'}
      </p>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-on-surface">Matching radius</legend>
        <div className="mt-2 flex gap-2">
          {LOCAL_RADII.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={radius === r}
              onClick={() => void changeRadius(r as LocalRadius)}
              className={cn(
                'flex-1 rounded-pill border px-4 py-2.5 text-sm font-semibold transition-colors',
                radius === r
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant/70 text-on-surface hover:bg-surface-container',
              )}
            >
              {r} km
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={locate}
        disabled={locating || saving}
        className="mt-5 inline-flex items-center gap-2 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
      >
        {locating || saving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <MapPin className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        )}
        {locating ? 'Finding your location…' : saving ? 'Saving…' : hasArea ? 'Update location' : 'Share my location'}
      </button>
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      {place && (
        <p className="mt-3 text-sm text-on-surface-variant">
          Area: <span className="font-semibold text-on-surface">{place.label}</span>
        </p>
      )}
    </div>
  )
}

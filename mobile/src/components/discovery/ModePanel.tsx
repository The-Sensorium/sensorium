import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { useAuth } from '../../auth-context'
import { CLUSTER_SIZE } from '../../lib/constants'
import type { MatchingMode } from '../../lib/modes'
import { LOCAL_RADII, type LocalRadius } from '../../lib/onboarding-draft'
import { getCurrentPosition, reverseGeocode } from '../../lib/geo'
import { requireSupabase } from '../../lib/supabase'
import { joinQueueErrorMessage, toErrorMessage } from '../../lib/error'
import { useMyQueueStatus, useJoinQueue, useQueueCount } from '../../features/matching'
import { useProfile } from '../../lib/use-profile'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { Card, LoadingView, PrimaryButton } from '../ui'

export function ModePanel({ mode }: { mode: MatchingMode }) {
  const status = useMyQueueStatus()
  const row = status.data?.find((r) => r.mode === mode)
  const [editingLocal, setEditingLocal] = useState(false)

  if (status.isLoading) {
    return (
      <Card>
        <LoadingView />
      </Card>
    )
  }
  if (!row) {
    return (
      <Card plain>
        <Text>This mode isn’t available yet.</Text>
      </Card>
    )
  }
  if (row.cluster_id) return <InClusterCard clusterId={row.cluster_id} />
  if (mode === 'local' && (row.queue_key === null || editingLocal)) {
    return <LocalSetupCard onDone={() => setEditingLocal(false)} />
  }
  if (row.joined && row.queue_key) {
    return (
      <JoinedCard
        mode={mode}
        queueKey={row.queue_key}
        onEditLocation={mode === 'local' ? () => setEditingLocal(true) : undefined}
      />
    )
  }
  if (row.queue_key) {
    return (
      <JoinCard
        mode={mode}
        queueKey={row.queue_key}
        waiting={row.waiting}
        onEditLocation={mode === 'local' ? () => setEditingLocal(true) : undefined}
      />
    )
  }
  return (
    <Card>
      <Text>This mode isn’t available yet.</Text>
    </Card>
  )
}

function InClusterCard({ clusterId }: { clusterId: string }) {
  const t = useTheme()
  return (
    <Card>
      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
        You’re already matched
      </Text>
      <Text style={{ marginTop: 4, fontSize: 20, fontWeight: '600', color: t.onSurface }}>
        You’re already in an active cluster
      </Text>
      <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
        This matching mode is full for you while your cluster is active. Head back to your room to
        keep the conversation going.
      </Text>
      <View style={{ marginTop: 20 }}>
        <Link href={{ pathname: '/cluster/[clusterId]/room', params: { clusterId } }} asChild>
          <PrimaryButton title="Open your cluster" onPress={() => {}} />
        </Link>
      </View>
    </Card>
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
  const t = useTheme()
  const join = useJoinQueue()
  const live = useQueueCount(mode, queueKey)
  const count = live.count ?? waiting
  const profile = useProfile()

  return (
    <Card>
      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
        Waiting in queue
      </Text>
      <Text style={{ marginTop: 4, fontSize: 20, fontWeight: '600', color: t.onSurface }}>
        {queueKey}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
        {count} of {CLUSTER_SIZE} ready
      </Text>
      <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
        Join this queue and you’ll be grouped with 7 strangers sharing this match. Clusters are
        permanent.
      </Text>
      <View style={{ marginTop: 20 }}>
        <PrimaryButton
          title="Join this queue"
          loadingTitle="Joining…"
          loading={join.isPending}
          onPress={() =>
            void join
              .mutateAsync({ mode, radiusKm: profile.data?.local_radius_km ?? undefined })
              .catch(() => undefined)
          }
        />
      </View>
      {onEditLocation ? (
        <Pressable onPress={onEditLocation} style={{ marginTop: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
            Update my location
          </Text>
        </Pressable>
      ) : null}
      {join.isError ? (
        <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>
          {joinQueueErrorMessage(join.error)}
        </Text>
      ) : null}
    </Card>
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
  const t = useTheme()
  const live = useQueueCount(mode, queueKey)
  const count = live.count ?? 0

  return (
    <Card>
      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
        You’re queued
      </Text>
      <Text style={{ marginTop: 4, fontSize: 20, fontWeight: '600', color: t.onSurface }}>
        {queueKey}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
        {count} of {CLUSTER_SIZE}
      </Text>
      <View style={{ marginTop: 20 }}>
        <Link href={{ pathname: '/queue/[queueId]', params: { queueId: mode } }} asChild>
          <PrimaryButton title="View queue" onPress={() => {}} />
        </Link>
      </View>
      {onEditLocation ? (
        <Pressable onPress={onEditLocation} style={{ marginTop: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
            Update my location
          </Text>
        </Pressable>
      ) : null}
    </Card>
  )
}

function LocalSetupCard({ onDone }: { onDone?: () => void }) {
  const t = useTheme()
  const auth = useAuth()
  const status = useMyQueueStatus()
  const profile = useProfile()
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [radius, setRadius] = useState<LocalRadius>(50)
  const [place, setPlace] = useState<{ slug: string; label: string } | null>(null)
  const hasArea = !!profile.data?.local_area
  const busy = locating || saving

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
    <Card>
      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
        Local matching
      </Text>
      <Text style={{ marginTop: 4, fontSize: 20, fontWeight: '600', color: t.onSurface }}>
        {hasArea ? 'Update your local area' : 'Set your local area'}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
        {hasArea
          ? 'You’ll be matched within your new area. If you’re currently queued locally, this updates your queue.'
          : 'You haven’t set a local area yet. Share your location once and you’ll be matched within your chosen radius. Your exact coordinates are never shared with cluster members.'}
      </Text>

      <Text style={{ marginTop: 16, fontSize: 14, fontWeight: '600', color: t.onSurface }}>
        Matching radius
      </Text>
      <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
        {LOCAL_RADII.map((r) => {
          const active = radius === r
          return (
            <Pressable
              key={r}
              onPress={() => void changeRadius(r as LocalRadius)}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: active ? t.primary : t.outlineVariant,
                backgroundColor: active ? t.primary : 'transparent',
                borderRadius: radii.pill,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: active ? t.onPrimary : t.onSurface }}>
                {r} km
              </Text>
            </Pressable>
          )
        })}
      </View>

      <View style={{ marginTop: 20 }}>
        <PrimaryButton
          title={hasArea ? 'Update location' : 'Share my location'}
          loadingTitle={locating ? 'Finding your location…' : 'Saving…'}
          loading={busy}
          onPress={locate}
        />
      </View>
      {error ? (
        <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{error}</Text>
      ) : null}
      {place ? (
        <Text style={{ marginTop: 12, fontSize: 14, color: t.onSurfaceVariant }}>
          Area: <Text style={{ fontWeight: '600', color: t.onSurface }}>{place.label}</Text>
        </Text>
      ) : null}
    </Card>
  )
}

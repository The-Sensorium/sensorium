import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { useAuth } from '../../auth-context'
import { CLUSTER_SIZE } from '../../lib/constants'
import type { MatchingMode } from '../../lib/modes'
import { LOCAL_RADII, LOCAL_RADIUS_LABELS, humanizeAreaSlug, localQueueKey, type LocalRadius } from '../../lib/onboarding-draft'
import { getCurrentPosition, reverseGeocode } from '../../lib/geo'
import { requireSupabase } from '../../lib/supabase'
import { joinQueueErrorMessage, toErrorMessage } from '../../lib/error'
import { useQueryClient } from '@tanstack/react-query'
import { useMyQueueStatus, useJoinQueue, useQueueCount } from '../../features/matching'
import { profileKey, useProfile, type Profile } from '../../lib/use-profile'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { Card, LoadingView, PrimaryButton } from '../ui'
import { Modal } from '../Modal'
import { WhatsNextSteps } from '../WhatsNextSteps'

export function ModePanel({ mode }: { mode: MatchingMode }) {
  const status = useMyQueueStatus()
  const row = status.data?.find((r) => r.mode === mode)
  const [editingLocal, setEditingLocal] = useState(false)
  const profile = useProfile()
  const hasLocalLocation =
    !!profile.data?.local_area && profile.data?.local_radius_km != null

  if (status.isLoading || (mode === 'local' && profile.isLoading)) {
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
  if (
    mode === 'local' &&
    (!row.queue_key || editingLocal || (!row.joined && !hasLocalLocation))
  ) {
    return <LocalSetupCard onDone={editingLocal ? () => setEditingLocal(false) : undefined} />
  }
  if (row.joined && row.queue_key) {
    return (
      <JoinedCard
        mode={mode}
        queueKey={row.queue_key}
        label={row.label}
        onEditLocation={mode === 'local' ? () => setEditingLocal(true) : undefined}
      />
    )
  }
  if (row.queue_key) {
    return (
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
      <Text style={{ marginTop: 4, fontSize: 20, lineHeight: 28, fontWeight: '600', color: t.onSurface }}>
        You’re already in an active cluster
      </Text>
      <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
        This matching mode is full for you while your cluster is active. Head back to your room to keep the conversation going.
      </Text>
      <View style={{ marginTop: 20 }}>
        <Link href={{ pathname: '/cluster/[clusterId]/room', params: { clusterId } }} asChild>
          <PrimaryButton
            title="Open your cluster"
            onPress={() => {}}
          />
        </Link>
      </View>
    </Card>
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
  const t = useTheme()
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
    <Card>
      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
        Waiting in queue
      </Text>
      <Text style={{ marginTop: 4, fontSize: 20, lineHeight: 28, fontWeight: '600', color: t.onSurface }}>
        {displayKey}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
        {count} of {CLUSTER_SIZE} ready
      </Text>
      <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
        {displayBlurb}
      </Text>
      <WhatsNextSteps />
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
        <Pressable onPress={onEditLocation} hitSlop={8} style={{ marginTop: 12, paddingVertical: 12, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.primary }}>
            Update my location
          </Text>
        </Pressable>
      ) : null}
      {join.isError ? (
        <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>
          {joinQueueErrorMessage(join.error, mode)}
        </Text>
      ) : null}
    </Card>
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
  const t = useTheme()
  const live = useQueueCount(mode, queueKey)
  const count = live.count ?? 0
  const displayKey = mode === 'open_mix' ? 'Open pool' : mode === 'local' && label ? label : queueKey

  return (
    <Card>
      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
        You’re queued
      </Text>
      <Text style={{ marginTop: 4, fontSize: 20, lineHeight: 28, fontWeight: '600', color: t.onSurface }}>
        {displayKey}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
        {count} of {CLUSTER_SIZE}
      </Text>
      <WhatsNextSteps />
      <View style={{ marginTop: 20 }}>
        <Link href={{ pathname: '/queue/[queueId]', params: { queueId: mode } }} asChild>
          <PrimaryButton title="View queue" onPress={() => {}} />
        </Link>
      </View>
      {onEditLocation ? (
        <Pressable onPress={onEditLocation} hitSlop={8} style={{ marginTop: 12, paddingVertical: 12, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.primary }}>
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
  const queryClient = useQueryClient()
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingRadius, setPendingRadius] = useState<LocalRadius | null>(null)
  const [joining, setJoining] = useState(false)
  const [pendingLeave, setPendingLeave] = useState<LocalRadius | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [radius, setRadius] = useState<LocalRadius | null>(
    (profile.data?.local_radius_km as LocalRadius | null) ?? null,
  )
  const [place, setPlace] = useState<{ slug: string; label: string; countryCode: string | null } | null>(null)
  const hasArea = !!profile.data?.local_area
  const busy = locating || saving

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
  const counts: Record<number, number | null> | undefined = areaSlug
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
            old ? { ...old, latitude: coords.lat, longitude: coords.lng, local_area: found.slug, local_country_code: found.countryCode } : old,
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
    <Card>
      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
        Local matching
      </Text>
      <Text style={{ marginTop: 4, fontSize: 20, lineHeight: 28, fontWeight: '600', color: t.onSurface }}>
        {hasArea ? 'Update your local area' : 'Set your local area'}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: t.onSurfaceVariant }}>
        {hasArea
          ? 'You’ll be matched within your new area. If you were in a queue, join the new one to continue.'
          : 'You haven’t set a local area yet. Share your location once and you’ll be matched within your chosen radius. Your exact coordinates are never shared with cluster members.'}
      </Text>

      {(place || hasArea) ? (
      <>
      <Text style={{ marginTop: 16, fontSize: 14, fontWeight: '600', color: t.onSurface }}>
        Matching radius
      </Text>
      <View style={{ marginTop: 8, flexDirection: 'column', gap: 8 }}>
        {LOCAL_RADII.map((r) => {
          const active = radius === r
          const count = counts?.[r] ?? null
          return (
            <Pressable
              key={r}
              onPress={() => onPickRadius(r as LocalRadius)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${r} kilometer radius`}
              style={{
                borderWidth: 1,
                borderColor: active ? t.primary : t.outlineVariant,
                backgroundColor: active ? t.primary : 'transparent',
                borderRadius: radii.pill,
                paddingVertical: 12,
                minHeight: 48,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: active ? t.onPrimary : t.onSurface }}>
                {r} km - {LOCAL_RADIUS_LABELS[r as LocalRadius]}{count != null ? ` - ${count}/8` : ''}
              </Text>
            </Pressable>
          )
        })}
      </View>
      </>
      ) : null}

      {(place || savedAreaLabel) && (
        <View style={{ marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <Text style={{ flexShrink: 1, fontSize: 14, color: t.onSurfaceVariant }}>
            Area: <Text style={{ fontWeight: '600', color: t.onSurface }}>{place?.label ?? savedAreaLabel}</Text>
          </Text>
        </View>
      )}
      {!hasArea ? (
      <View style={{ marginTop: 20 }}>
        <PrimaryButton
          title="Share my location"
          loadingTitle={locating ? 'Finding your location…' : 'Saving…'}
          loading={busy}
          onPress={locate}
        />
      </View>
      ) : null}
      {hasArea && radius != null ? (
        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>Wrong area?</Text>
          <Pressable
            onPress={locate}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Update location"
            style={{ minHeight: 44, justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
              {busy ? 'Locating…' : 'Update location'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {pendingRadius != null ? (
        <Modal
          open={pendingRadius != null}
          onClose={closeRadiusDialog}
          title={`Join the ${pendingRadius} km queue?`}
        >
          <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
            {`You’ll be matched within ${pendingRadius} km of ${dialogAreaLabel}${
              pendingCount != null ? `, where ${pendingCount} of ${CLUSTER_SIZE} are waiting` : ''
            }.`}
          </Text>
          {dialogError ? (
            <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{dialogError}</Text>
          ) : null}
          <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={closeRadiusDialog}
              disabled={joining}
              hitSlop={8}
              style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, justifyContent: 'center', opacity: joining ? 0.6 : 1 }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
            </Pressable>
            <PrimaryButton
              title="Join queue"
              loadingTitle="Joining…"
              loading={joining}
              onPress={() => void confirmRadiusJoin()}
            />
          </View>
        </Modal>
      ) : null}
      {pendingLeave != null ? (
        <Modal
          open={pendingLeave != null}
          onClose={closeLeaveDialog}
          title={`Leave the ${pendingLeave} km queue?`}
        >
          <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
            {`You’ll stop waiting within ${pendingLeave} km of ${dialogAreaLabel}. Your radius choice will be cleared, but your area stays saved.`}
          </Text>
          {dialogError ? (
            <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{dialogError}</Text>
          ) : null}
          <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={closeLeaveDialog}
              disabled={leaving}
              hitSlop={8}
              style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, justifyContent: 'center', opacity: leaving ? 0.6 : 1 }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
            </Pressable>
            <PrimaryButton
              title="Leave queue"
              loadingTitle="Leaving…"
              loading={leaving}
              tone="error"
              onPress={() => void confirmRadiusLeave()}
            />
          </View>
        </Modal>
      ) : null}
      {error ? (
        <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{error}</Text>
      ) : null}
      {hasArea && onDone ? (
        <View style={{ marginTop: 20, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={8}
            style={{ borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingHorizontal: 20, paddingVertical: 12, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  )
}

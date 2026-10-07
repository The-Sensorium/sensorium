import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { CalendarDays, X } from 'lucide-react-native'
import { useAuth } from '../../auth-context'
import { useClusterMeetups, useMeetupState } from '../../features/meetups'
import { MEETUP_ENABLED, formatSlotCompact24, hasEnded, metThisWeek } from '../../lib/meetup'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'

const ACTIVE_STATUSES = ['proposed', 'voting', 'confirmed', 'starting', 'active']

// Session-level mirror of the persisted dismissal so remounts do not flash
// the banner before AsyncStorage resolves.
const dismissedCache = new Map<string, string>()
// Keys whose dismissal has been read at least once, including the negative
// (no dismissal) case. Without this every remount to a cluster with no
// dismissal re-reads storage and delays the banner each visit.
const dismissalChecked = new Set<string>()

function dismissalKey(userId: string, clusterId: string) {
  return `sensorium:dismissed-meetup:${userId}:${clusterId}`
}

/** Quiet entry point at the top of the room. Hidden when the flag is off. */
export function MeetupEntry({ clusterId, callLive = false }: { clusterId: string; callLive?: boolean }) {
  const t = useTheme()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const meetups = useClusterMeetups(MEETUP_ENABLED ? clusterId || null : null)
  const rows = MEETUP_ENABLED ? (meetups.data ?? []) : []
  const voting = rows.find((m) => m.status === 'voting') ?? null
  const voteState = useMeetupState(voting ? voting.id : null)
  const key = userId ? dismissalKey(userId, clusterId) : null
  const [dismissedId, setDismissedId] = useState<string | null>(() => (key ? dismissedCache.get(key) ?? null : null))
  // Render nothing until the dismissal is resolved. Otherwise the banner
  // flashes on entry while AsyncStorage is still reading, then vanishes.
  const [dismissalReady, setDismissalReady] = useState(
    () => (key ? dismissedCache.has(key) || dismissalChecked.has(key) : true),
  )
  // The caller remounts per cluster via key, so this sync is defense-in-depth
  // for any reuse without remounting: always resolve the current cluster's
  // dismissal, otherwise one cluster's dismissal leaks into another's banner.
  useEffect(() => {
    if (!key) {
      setDismissedId(null)
      setDismissalReady(true)
      return
    }
    const cached = dismissedCache.get(key)
    if (cached !== undefined || dismissalChecked.has(key)) {
      setDismissedId(cached ?? null)
      setDismissalReady(true)
      return
    }
    setDismissalReady(false)
    let cancelled = false
    void AsyncStorage.getItem(key)
      .then((value) => {
        if (cancelled) return
        if (typeof value === 'string' && value) {
          dismissedCache.set(key, value)
          setDismissedId(value)
        } else {
          setDismissedId(null)
        }
        dismissalChecked.add(key)
        setDismissalReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setDismissedId(null)
        setDismissalReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [key])
  if (!MEETUP_ENABLED) return null
  if (callLive) return null
  // Derived synchronously so the auth loading transition (first render with
  // no key, then a key once signed in) can never show one frame of stale
  // state before the effect below runs.
  const cachedDismissal = key ? dismissedCache.get(key) : undefined
  if (!dismissalReady || (key && cachedDismissal === undefined && !dismissalChecked.has(key))) return null
  if (meetups.isPending || meetups.isError) return null
  const active = rows.find((m) => ACTIVE_STATUSES.includes(m.status)) ?? null
  const lastDone = rows.find((m) => m.status === 'completed') ?? null
  // Past the scheduled end the meetup reads as finished: no banner, even
  // before the expiry cron completes the row. A lingering call hides the
  // banner already via callLive.
  if (active && hasEnded(active.ends_at)) return null

  // The list carries no per-user vote info. While the vote state is still
  // loading the banner stays neutral ("View") so voters never see a stale
  // "Vote" prompt; on error it falls back to the "Vote" prompt as before.
  // Voters get no banner at all until the meetup is confirmed.
  const voteResolved = voting === null || voteState.data !== undefined || voteState.isError
  const showVotePrompt = voting !== null && voteResolved && voteState.data?.my_slot_id == null
  // The empty propose id carries the cluster so a dismissal in one cluster
  // can never match another cluster's banner, even with a stale state.
  const bannerId = active ? active.id : `propose:${clusterId}:${lastDone?.id ?? 'none'}`
  const effectiveDismissedId = cachedDismissal ?? dismissedId
  if (bannerId === effectiveDismissedId) return null
  if (!active && lastDone && metThisWeek(lastDone.completed_at, lastDone.ends_at)) return null

  function dismiss() {
    setDismissedId(bannerId)
    if (key) {
      dismissedCache.set(key, bannerId)
      void AsyncStorage.setItem(key, bannerId).catch(() => undefined)
    }
  }
  if (voting !== null && voteResolved && !showVotePrompt) return null

  const subtitle = active
    ? active.status === 'voting'
      ? showVotePrompt
        ? 'Vote for a time this week.'
        : 'You voted. Waiting for others.'
      : active.starts_at
        ? formatSlotCompact24(active.starts_at)
        : 'A meetup is being planned.'
    : 'Meet the people behind the messages.'
  const cta = active ? (active.status === 'voting' ? (showVotePrompt ? 'Vote' : 'View') : 'View') : 'Propose a time'

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: t.surfaceContainer,
        borderWidth: 1,
        borderColor: t.outlineVariant,
        borderRadius: radii.xl,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 8,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.primary,
        }}
      >
        <CalendarDays size={16} color={t.onPrimary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
          Cluster Meetup
        </Text>
        <Text style={{ fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Open Cluster Meetup"
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/cluster/[clusterId]/meetups', params: { clusterId } })}
        style={{
          backgroundColor: t.primary,
          borderRadius: radii.pill,
          paddingHorizontal: 20,
          paddingVertical: 12,
          minHeight: 48,
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: t.onPrimary, fontSize: 14, fontWeight: '600' }}>{cta}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Dismiss meetup banner"
        accessibilityRole="button"
        onPress={dismiss}
        hitSlop={8}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={18} color={t.onSurfaceVariant} strokeWidth={1.5} />
      </Pressable>
    </View>
  )
}

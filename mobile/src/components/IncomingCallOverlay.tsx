import { useEffect, useMemo, useState } from 'react'
import { AppState, Pressable, Text, Vibration, View } from 'react-native'
import { router, usePathname } from 'expo-router'
import { useAudioPlayer } from 'expo-audio'
import { Phone, X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from './Avatar'
import { useAuth } from '../auth-context'
import { useJoinCall, useRingingCall } from '../features/cluster-calls'
import { useClusterMembers } from '../features/matching'
import { useTheme } from '../lib/use-theme'
import { radii } from '../lib/theme-tokens'

const RINGTONE = require('../../assets/incoming-call.wav')
const RING_TIMEOUT_MS = 60_000

/**
 * App-wide incoming call alert. Mounted once above the app stack so a ringing
 * call reaches the member on any screen; the room's own banner stays the
 * in-room experience. Ringing is foreground only, the OS push covers the rest.
 */
export function IncomingCallOverlay() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const ringing = useRingingCall(userId)
  const call = ringing.data ?? null
  const joinCall = useJoinCall(call?.cluster_id ?? null)
  const members = useClusterMembers(call?.cluster_id ?? null, call !== null)
  const player = useAudioPlayer(RINGTONE)
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const [appActive, setAppActive] = useState(AppState.currentState === 'active')

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'))
    return () => sub.remove()
  }, [])

  const caller = useMemo(
    () => (members.data ?? []).find((member) => member.id === call?.initiated_by) ?? null,
    [members.data, call?.initiated_by],
  )

  const onCallScreen =
    pathname.endsWith('/call') ||
    (call !== null && pathname === `/cluster/${call.cluster_id}/room`)
  const visible = call !== null && call.id !== dismissedId && appActive && !onCallScreen
  const callId = call?.id ?? null

  // A ringing alert that outlives the moment (missed realtime update, phone in
  // a pocket) silences itself; the room banner remains the way back in.
  useEffect(() => {
    if (!visible || !callId) return
    const id = setTimeout(() => setDismissedId(callId), RING_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [visible, callId])

  useEffect(() => {
    if (!visible) {
      try {
        player.pause()
        void player.seekTo(0).catch(() => undefined)
      } catch {
      }
      Vibration.cancel()
      return
    }
    // expo-audio exposes loop as a mutable player property, not an option.
    // oxlint-disable-next-line react/immutability
    player.loop = true
    try {
      player.play()
    } catch {
    }
    Vibration.vibrate([0, 900, 300], true)
    return () => {
      try {
        player.pause()
        void player.seekTo(0).catch(() => undefined)
      } catch {
      }
      Vibration.cancel()
    }
  }, [visible, player])

  if (!visible || !call) return null

  const label = `${caller?.display_name ?? 'A member'} is calling`
  const joining = joinCall.isPending

  async function handleJoin() {
    if (!call) return
    try {
      await joinCall.mutateAsync(call.id)
      router.push({
        pathname: '/cluster/[clusterId]/call',
        params: { clusterId: call.cluster_id, callId: call.id },
      })
    } catch {
      setDismissedId(call.id)
    }
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 50 }}
    >
      <View
        accessibilityLiveRegion="assertive"
        accessibilityLabel={label}
        style={{
          backgroundColor: t.surface,
          borderColor: t.primary,
          borderWidth: 1,
          borderRadius: radii.xl,
          padding: 16,
          gap: 12,
          shadowColor: t.shadowColor,
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar
            name={caller?.display_name ?? 'Member'}
            src={caller?.avatar_url}
            thumbSrc={caller?.avatar_thumb_url ?? caller?.avatar_url}
            size={44}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, lineHeight: 22, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
              {label}
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 18, color: t.onSurfaceVariant }} numberOfLines={1}>
              Cluster call
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss call"
            onPress={() => setDismissedId(call.id)}
            disabled={joining}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: t.outlineVariant,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              opacity: joining ? 0.6 : 1,
            }}
          >
            <X size={16} color={t.onSurface} strokeWidth={2} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Dismiss</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Join call"
            onPress={() => void handleJoin()}
            disabled={joining}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: radii.pill,
              backgroundColor: t.primary,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              opacity: joining ? 0.6 : 1,
            }}
          >
            <Phone size={16} color={t.onPrimary} strokeWidth={2} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onPrimary }}>
              {joining ? 'Joining…' : 'Join'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

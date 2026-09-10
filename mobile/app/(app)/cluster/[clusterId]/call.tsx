import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import {
  LiveKitRoom,
  VideoTrack,
  registerGlobals,
  useLocalParticipant,
  useTracks,
} from '@livekit/react-native'
import { Track } from 'livekit-client'
import { Clock, Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react-native'
import {
  CALL_WARNING_SECONDS,
  useCall,
  useCallToken,
  useLeaveCall,
} from '../../../../src/features/cluster-calls'
import { formatCallDuration } from '../../../../src/components/room/format'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'

registerGlobals()

function Controls({ onHangUp }: { onHangUp: () => void }) {
  const t = useTheme()
  const { localParticipant } = useLocalParticipant()
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(false)

  async function toggleMic() {
    const next = !micOn
    setMicOn(next)
    await localParticipant.setMicrophoneEnabled(next).catch(() => setMicOn(!next))
  }

  async function toggleCamera() {
    const next = !cameraOn
    setCameraOn(next)
    await localParticipant.setCameraEnabled(next).catch(() => setCameraOn(!next))
  }

  const buttons = [
    {
      label: micOn ? 'Mute' : 'Unmute',
      on: micOn,
      onPress: toggleMic,
      onIcon: <Mic size={20} color="#fff" strokeWidth={2} />,
      offIcon: <MicOff size={20} color="#fff" strokeWidth={2} />,
    },
    {
      label: cameraOn ? 'Camera off' : 'Camera on',
      on: cameraOn,
      onPress: toggleCamera,
      onIcon: <Video size={20} color="#fff" strokeWidth={2} />,
      offIcon: <VideoOff size={20} color="#fff" strokeWidth={2} />,
    },
  ]

  return (
    <View style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        {buttons.map((b) => (
          <Pressable
            key={b.label}
            accessibilityLabel={b.label}
            onPress={() => void b.onPress()}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: b.on ? t.primary : t.surfaceHighest,
            }}
          >
            {b.on ? b.onIcon : b.offIcon}
          </Pressable>
        ))}
        <Pressable
          accessibilityLabel="Hang up"
          onPress={onHangUp}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.error,
          }}
        >
          <PhoneOff size={20} color="#fff" strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  )
}

function Stage() {
  const t = useTheme()
  const tracks = useTracks([Track.Source.Camera])
  if (tracks.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 14, color: t.onSurfaceVariant, textAlign: 'center' }}>
          Connected — waiting for video. Others join audio-first on mobile.
        </Text>
      </View>
    )
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 }}>
      {tracks.map((trackRef) => (
        <View
          key={`${trackRef.participant.identity}-${trackRef.publication?.trackSid ?? 'novideo'}`}
          style={{ flexBasis: '48%', flexGrow: 1, aspectRatio: 3 / 4, borderRadius: radii.xl, overflow: 'hidden' }}
        >
          <VideoTrack trackRef={trackRef} style={{ flex: 1 }} mirror={trackRef.participant.isLocal} />
        </View>
      ))}
    </View>
  )
}

export default function CallScreen() {
  const t = useTheme()
  const { clusterId = '', callId = '' } = useLocalSearchParams<{ clusterId: string; callId: string }>()
  const tokenQuery = useCallToken(callId || null, true)
  const leaveCall = useLeaveCall(clusterId || null)
  const call = useCall(callId || null)
  const leftRef = useRef(false)

  // Single exit path: leave the call (best effort) and go back once. Both the
  // hang-up control and a LiveKit disconnect route through here, so the guard
  // stops a manual disconnect from popping two screens. Leaving does not end
  // the call for others; the server ends it when the last participant leaves.
  const finishCall = useCallback(() => {
    if (leftRef.current) return
    leftRef.current = true
    router.back()
    void leaveCall.mutateAsync(callId).catch(() => {})
  }, [callId, leaveCall])

  // Call clock: elapsed for the display, remaining against the server-side limit.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const started = call.data ? Date.parse(call.data.created_at) : Number.NaN
  const expires = call.data ? Date.parse(call.data.expires_at) : Number.NaN
  const elapsed = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0
  const remaining = Number.isFinite(expires) ? Math.max(0, Math.floor((expires - now) / 1000)) : 0
  const warning = Number.isFinite(expires) && remaining <= CALL_WARNING_SECONDS

  useEffect(() => {
    if (Number.isFinite(expires) && remaining <= 0) finishCall()
  }, [expires, remaining, finishCall])

  useEffect(() => {
    if (tokenQuery.isSuccess && !tokenQuery.data) router.back()
  }, [tokenQuery.isSuccess, tokenQuery.data])

  if (!callId || !clusterId) {
    router.back()
    return null
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ fontSize: 17, fontWeight: '600', color: t.onSurface }}>Cluster call</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: warning ? t.errorContainer : t.surfaceContainer,
            borderRadius: radii.pill,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Clock size={12} color={warning ? t.error : t.onSurfaceVariant} strokeWidth={1.5} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: warning ? t.error : t.onSurfaceVariant }}>
            {warning ? `${formatCallDuration(remaining)} left` : formatCallDuration(elapsed)}
          </Text>
        </View>
      </View>
      {tokenQuery.isPending ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <ActivityIndicator color={t.primary} />
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>Joining the call…</Text>
        </View>
      ) : tokenQuery.isError || !tokenQuery.data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant, textAlign: 'center' }}>
            Could not join the call. It may have ended — try starting a new one.
          </Text>
          <Pressable
            accessibilityLabel="Close"
            onPress={() => router.back()}
            style={{
              borderWidth: 1,
              borderColor: t.outlineVariant,
              borderRadius: radii.pill,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Close</Text>
          </Pressable>
        </View>
      ) : (
        <LiveKitRoom
          serverUrl={tokenQuery.data.url}
          token={tokenQuery.data.token}
          connect
          audio
          video={false}
          onDisconnected={finishCall}
        >
          <View style={{ flex: 1 }}>
            <Stage />
            <Controls onHangUp={finishCall} />
          </View>
        </LiveKitRoom>
      )}
    </SafeAreaView>
  )
}

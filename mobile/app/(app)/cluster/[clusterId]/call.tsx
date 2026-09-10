import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { LiveKitRoom } from '@livekit/react-native'
import {
  CALL_WARNING_SECONDS,
  useCall,
  useCallToken,
  useLeaveCall,
} from '../../../../src/features/cluster-calls'
import { CallControls } from '../../../../src/components/room/call/CallControls'
import { CallGrid } from '../../../../src/components/room/call/CallGrid'
import { CallHeader } from '../../../../src/components/room/call/CallHeader'
import { CallChatSheet } from '../../../../src/components/room/call/CallChatSheet'
import { PreJoin, type PreJoinChoices } from '../../../../src/components/room/call/PreJoin'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'

function TitleBar() {
  const t = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: '600', color: t.onSurface }}>Cluster call</Text>
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

  // The cluster routes live in a tab navigator, whose default back behavior
  // sends `goBack` to the first tab (Home) rather than the room the call was
  // opened from. Navigate to the room explicitly so leaving a call lands where
  // the user started.
  const exitToRoom = useCallback(() => {
    if (!clusterId) {
      router.back()
      return
    }
    router.navigate({ pathname: '/cluster/[clusterId]/room', params: { clusterId } })
  }, [clusterId])

  // Single exit path: leave the call (best effort) and return to the room once.
  // Both the hang-up control and a LiveKit disconnect route through here, so
  // the guard stops a manual disconnect from navigating twice. Leaving does not
  // end the call for others; the server ends it when the last participant leaves.
  const finishCall = useCallback(() => {
    if (leftRef.current) return
    leftRef.current = true
    exitToRoom()
    void leaveCall.mutateAsync(callId).catch(() => {})
  }, [callId, exitToRoom, leaveCall])

  // Calls are audio-first on mobile: the PreJoin sheet starts the camera off
  // and narrows the join instead of blocking it when permissions are denied.
  const [joined, setJoined] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [callUnread, setCallUnread] = useState(0)

  function handleJoinCall(choices: PreJoinChoices) {
    setMicOn(choices.mic)
    setCameraOn(choices.camera)
    setJoined(true)
  }

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
    if (tokenQuery.isSuccess && !tokenQuery.data) exitToRoom()
  }, [tokenQuery.isSuccess, tokenQuery.data, exitToRoom])

  // Navigate out of a malformed route in an effect rather than during render,
  // so the imperative navigation isn't a render-phase side effect.
  const missingParams = !callId || !clusterId
  useEffect(() => {
    if (missingParams) exitToRoom()
  }, [missingParams, exitToRoom])

  // Safety net: room.tsx inserts the participant row before navigating here, so
  // if the screen is dismissed without finishCall (e.g. Android hardware back,
  // or cancelling PreJoin), release it. Deferred a tick so a Fast Refresh
  // remount doesn't spuriously leave.
  const mountedRef = useRef(false)
  const latestRef = useRef({ leaveCall, callId })
  useEffect(() => {
    latestRef.current = { leaveCall, callId }
  }, [leaveCall, callId])

  // The cluster tabs keep every screen mounted, so this screen is reused across
  // calls. Reset on focus (fresh PreJoin, leave allowed) and release the seat on
  // blur (hardware back / navigating away) without navigating again.
  useFocusEffect(
    useCallback(() => {
      leftRef.current = false
      setJoined(false)
      setChatOpen(false)
      setCallUnread(0)
      return () => {
        // Leaving the screen must drop the LiveKit connection however it was
        // left (explicit hang-up, hardware back, or navigating away), otherwise
        // the kept-mounted tab leaves the participant connected and other
        // clients never see the tile disappear.
        setJoined(false)
        if (!leftRef.current) {
          leftRef.current = true
          void latestRef.current.leaveCall.mutateAsync(latestRef.current.callId).catch(() => {})
        }
      }
    }, []),
  )
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      setTimeout(() => {
        if (!mountedRef.current && !leftRef.current) {
          void latestRef.current.leaveCall.mutateAsync(latestRef.current.callId).catch(() => {})
        }
      }, 0)
    }
  }, [])

  if (missingParams) return null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      {tokenQuery.isPending ? (
        <>
          <TitleBar />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ActivityIndicator color={t.primary} />
            <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>Joining the call…</Text>
          </View>
        </>
      ) : tokenQuery.isError || !tokenQuery.data ? (
        <>
          <TitleBar />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
            <Text style={{ fontSize: 14, color: t.onSurfaceVariant, textAlign: 'center' }}>
              Could not join the call. It may have ended — try starting a new one.
            </Text>
            <Pressable
              accessibilityLabel="Close"
              onPress={finishCall}
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
        </>
      ) : !joined ? (
        <>
          <TitleBar />
          <PreJoin
            initialMicOn={micOn}
            initialCameraOn={cameraOn}
            onJoin={handleJoinCall}
            onCancel={finishCall}
          />
        </>
      ) : (
        <LiveKitRoom
          serverUrl={tokenQuery.data.url}
          token={tokenQuery.data.token}
          connect
          audio={micOn}
          video={cameraOn}
          onDisconnected={finishCall}
        >
          <View style={{ flex: 1 }}>
            <CallHeader elapsed={elapsed} remaining={remaining} warning={warning} />
            <CallGrid />
            <CallControls
              onHangUp={finishCall}
              initialMicOn={micOn}
              initialCameraOn={cameraOn}
              chatOpen={chatOpen}
              unread={callUnread}
              onChatPress={() => setChatOpen((open) => !open)}
            />
            <CallChatSheet
              open={chatOpen}
              onClose={() => setChatOpen(false)}
              onUnreadChange={setCallUnread}
            />
          </View>
        </LiveKitRoom>
      )}
    </SafeAreaView>
  )
}

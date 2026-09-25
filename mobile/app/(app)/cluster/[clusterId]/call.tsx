import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import {
  CALL_TOKEN_RATE_LIMITED,
  CALL_WARNING_SECONDS,
  useActiveCall,
  useCall,
  useCallParticipants,
  useCallToken,
  useLeaveCall,
} from '../../../../src/features/cluster-calls'
import { useAuth } from '../../../../src/auth-context'
import { PreJoin, type PreJoinChoices } from '../../../../src/components/room/call/PreJoin'
import { isLiveKitAvailable } from '../../../../src/lib/livekit'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'

const CallSession = lazy(() =>
  import('../../../../src/components/room/call/CallSession').then((mod) => ({
    default: mod.CallSession,
  })),
)

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
      <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.onSurface }} accessibilityRole="header">Cluster call</Text>
    </View>
  )
}

export default function CallScreen() {
  const t = useTheme()
  const { clusterId = '', callId = '' } = useLocalSearchParams<{
    clusterId: string
    callId: string
  }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const liveKitReady = isLiveKitAvailable()
  const tokenQuery = useCallToken(callId || null, liveKitReady)
  const leaveCall = useLeaveCall(clusterId || null)
  const call = useCall(callId || null)
  const activeCall = useActiveCall(clusterId || null)
  const participants = useCallParticipants(callId || null)
  const leftRef = useRef(false)
  const focusedRef = useRef(true)
  const rateLimited =
    tokenQuery.error instanceof Error && tokenQuery.error.message === CALL_TOKEN_RATE_LIMITED

  // The call screen is a tab route, and React Navigation tabs have no REPLACE
  // event: expo-router maps router.replace to JUMP_TO, which leaves this
  // route in the history trail (expo/expo#36385), so a later Android back
  // press resurfaces its PreJoin for a call that already ended. router.back
  // instead pops the visit trail (backBehavior="history" on the tab
  // navigator), removing this route, so Back can never return to it.
  // Exits are one-shot: without the guard a repeated trigger (StrictMode
  // double effects, a settling query) would pop an extra screen.
  const exitedRef = useRef(false)
  const exitToRoom = useCallback(() => {
    if (exitedRef.current) return
    exitedRef.current = true
    router.back()
  }, [])

  // Single exit path for leaving deliberately: hang-up control, LiveKit
  // disconnect, and expiry route through here. Leaving does not end the call
  // for others; the server ends it when the last participant leaves. The
  // screen only navigates when focused: a disconnect that fires while
  // minimized must release the seat without yanking navigation.
  const finishCall = useCallback(() => {
    if (leftRef.current) return
    leftRef.current = true
    if (focusedRef.current) exitToRoom()
    void leaveCall.mutateAsync(callId).catch(() => {})
  }, [callId, exitToRoom, leaveCall])

  // Calls are audio-first on mobile: the PreJoin sheet starts the camera off
  // and narrows the join instead of blocking it when permissions are denied.
  const [joined, setJoined] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(false)

  function handleJoinCall(choices: PreJoinChoices) {
    setMicOn(choices.mic)
    setCameraOn(choices.camera)
    setJoined(true)
  }

  // If the seat disappears under a live session (left from the room banner,
  // or the call otherwise ended for us), drop local media instead of
  // publishing into a call we are no longer in. The render gate unmounts the
  // session silently (correct while minimized); the effect below additionally
  // exits a focused screen to the room, where the banner Join path heals
  // membership. Only acts on settled roster data: while a roster refetch is
  // in flight the previous roster may briefly omit us (e.g. right after
  // rejoining), which must not tear down the session.
  const rosterSettled = participants.isSuccess && !participants.isFetching && userId !== null
  const amParticipant = (participants.data ?? []).some((p) => p.user_id === userId)
  const seatKept = !rosterSettled || amParticipant
  useEffect(() => {
    if (!joined || seatKept || !focusedRef.current) return
    exitToRoom()
  }, [joined, seatKept, exitToRoom])

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
  // if the screen unmounts without finishCall, release the seat. Blur alone
  // minimizes and must not release: navigating away keeps the LiveKit
  // connection and the seat, and the room banner returns to the live call.
  // Deferred a tick so a Fast Refresh remount doesn't spuriously leave.
  const mountedRef = useRef(false)
  const latestRef = useRef({ leaveCall, callId })
  useEffect(() => {
    latestRef.current = { leaveCall, callId }
  }, [leaveCall, callId])

  // The cluster tabs keep every screen mounted, so this screen is reused across
  // calls. Back and tab switches minimize: the LiveKit connection and the
  // server seat stay alive, and the room banner returns to the live call, so
  // only a fresh call (or a return after an explicit hang-up) resets to
  // PreJoin. A route that survives for an already-ended call (deep link)
  // still exits straight to the room instead of offering a stale join.
  // The single-call cache (useCall) is never invalidated, so a cached
  // ringing/active status cannot be trusted here: liveness is revalidated
  // with a fresh server read, and only a live call with this id keeps the
  // screen. Failures keep the screen rather than trapping the user.
  // Everything here keys off refs so call updates never re-fire this effect
  // mid-call: re-running would reset the join state while connected.
  const callStatusRef = useRef(call.data?.status)
  const activeCallRef = useRef(activeCall)
  const lastCallIdRef = useRef(callId)
  useEffect(() => {
    callStatusRef.current = call.data?.status
    activeCallRef.current = activeCall
  })
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      focusedRef.current = true
      exitedRef.current = false
      const freshStart = callId !== lastCallIdRef.current || leftRef.current
      if (freshStart) {
        // Fresh call on a reused screen, or returning after an explicit
        // hang-up: reset to PreJoin with audio-first defaults. A fresh start
        // must never bounce on a liveness refetch: start_call just seated us
        // and the token/roster flows are the real guards.
        lastCallIdRef.current = callId
        leftRef.current = false
        setMicOn(true)
        setCameraOn(false)
        setJoined(false)
      } else if (callStatusRef.current === 'ended') {
        exitToRoom()
        return
      } else {
        // Same route revisited (deep link, or a route that survived an ended
        // call): the single-call cache is never invalidated, so revalidate
        // liveness against the server and exit only if the cluster no longer
        // has this call live.
        void activeCallRef.current.refetch().then((result) => {
          if (cancelled || !result.isSuccess) return
          if (!result.data || result.data.id !== latestRef.current.callId) exitToRoom()
        })
      }
      return () => {
        cancelled = true
        focusedRef.current = false
        // Blur minimizes: media and seat stay alive. Release happens on
        // hang-up, expiry, unmount, or a dead call, never on blur.
      }
    }, [callId, exitToRoom]),
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

  if (!liveKitReady) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
        <TitleBar />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant, textAlign: 'center' }}>
            Calls need the Sensorium development build. Expo Go can’t load the native WebRTC module.
          </Text>
          <Pressable
            accessibilityLabel="Close"
            onPress={finishCall}
            hitSlop={4}
            style={{
              borderWidth: 1,
              borderColor: t.outlineVariant,
              borderRadius: radii.pill,
              paddingHorizontal: 20,
              paddingVertical: 12,
              minHeight: 48,
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

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
              {rateLimited
                ? 'Joining too often. Wait a minute and try again.'
                : 'Could not join the call. It may have ended. Try starting a new one.'}
            </Text>
            <Pressable
              accessibilityLabel="Close"
              onPress={finishCall}
              hitSlop={4}
              style={{
                borderWidth: 1,
                borderColor: t.outlineVariant,
                borderRadius: radii.pill,
                paddingHorizontal: 20,
                paddingVertical: 12,
                minHeight: 48,
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Close</Text>
            </Pressable>
          </View>
        </>
      ) : !joined || !seatKept ? (
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
        <Suspense
          fallback={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ActivityIndicator color={t.primary} />
              <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>Joining the call…</Text>
            </View>
          }
        >
          <CallSession
            serverUrl={tokenQuery.data.url}
            token={tokenQuery.data.token}
            micOn={micOn}
            cameraOn={cameraOn}
            elapsed={elapsed}
            remaining={remaining}
            warning={warning}
            onDisconnected={finishCall}
            onHangUp={finishCall}
          />
        </Suspense>
      )}
    </SafeAreaView>
  )
}

import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { LiveKitRoom } from '@livekit/react-native'
import { setupCallAudioSession, teardownCallAudioSession } from '../../../lib/call-audio'
import { CallChatSheet } from './CallChatSheet'
import { CallControls } from './CallControls'
import { CallGrid } from './CallGrid'
import { CallHeader } from './CallHeader'

interface CallSessionProps {
  serverUrl: string
  token: string
  micOn: boolean
  cameraOn: boolean
  elapsed: number
  remaining: number
  warning: boolean
  onDisconnected: () => void
  onHangUp: () => void
}

/**
 * The connected call surface. Kept in its own module and lazy-loaded from the
 * call route so the native LiveKit/WebRTC import is never evaluated unless a
 * call is actually joined — Expo Go, where the native module is absent, never
 * reaches this module.
 */
export function CallSession({
  serverUrl,
  token,
  micOn,
  cameraOn,
  elapsed,
  remaining,
  warning,
  onDisconnected,
  onHangUp,
}: CallSessionProps) {
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [audioReady, setAudioReady] = useState(false)

  // Route call audio to the loudspeaker (headsets keep precedence, including
  // devices connected mid-call) before the room connects: AudioSession
  // configuration only applies when set prior to connecting, and the room
  // gates on it below. Best-effort: the setup never rejects, so joining is
  // delayed by milliseconds, never blocked.
  useEffect(() => {
    void setupCallAudioSession().finally(() => setAudioReady(true))
    return () => {
      void teardownCallAudioSession()
    }
  }, [])

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect={audioReady}
      audio={micOn}
      video={cameraOn}
      onDisconnected={onDisconnected}
    >
      <View style={{ flex: 1 }}>
        <CallHeader elapsed={elapsed} remaining={remaining} warning={warning} />
        <CallGrid />
        <CallControls
          onHangUp={onHangUp}
          initialMicOn={micOn}
          initialCameraOn={cameraOn}
          chatOpen={chatOpen}
          unread={unread}
          onChatPress={() => setChatOpen((open) => !open)}
        />
        <CallChatSheet
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          onUnreadChange={setUnread}
        />
      </View>
    </LiveKitRoom>
  )
}

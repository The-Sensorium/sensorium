import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useConnectionState, useLocalParticipant } from '@livekit/react-native'
import { ConnectionState } from 'livekit-client'
import { Mic, MicOff, MessageSquare, PhoneOff, Video, VideoOff } from 'lucide-react-native'
import { useTheme } from '../../../lib/use-theme'

interface CallControlsProps {
  onHangUp: () => void
  initialMicOn: boolean
  initialCameraOn: boolean
  chatOpen: boolean
  onChatPress: () => void
}

/** Mic, camera, chat, and hang-up. */
export function CallControls({
  onHangUp,
  initialMicOn,
  initialCameraOn,
  chatOpen,
  onChatPress,
}: CallControlsProps) {
  const t = useTheme()
  const { localParticipant } = useLocalParticipant()
  const connection = useConnectionState()
  const live = connection === ConnectionState.Connected
  const [micOn, setMicOn] = useState(initialMicOn)
  const [cameraOn, setCameraOn] = useState(initialCameraOn)

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
            disabled={!live}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: b.on ? t.primary : t.surfaceHighest,
              opacity: live ? 1 : 0.6,
            }}
          >
            {b.on ? b.onIcon : b.offIcon}
          </Pressable>
        ))}
        <Pressable
          accessibilityLabel={chatOpen ? 'Close chat' : 'Open chat'}
          onPress={onChatPress}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: chatOpen ? t.primary : t.surfaceHighest,
          }}
        >
          <MessageSquare
            size={20}
            color={chatOpen ? '#fff' : t.onSurfaceVariant}
            strokeWidth={2}
          />
        </Pressable>
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

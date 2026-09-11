import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useConnectionState, useLocalParticipant } from '@livekit/react-native'
import { ConnectionState } from 'livekit-client'
import { Mic, MicOff, MessageSquare, PhoneOff, Video, VideoOff } from 'lucide-react-native'
import { useTheme } from '../../../lib/use-theme'
import { useResolvedScheme } from '../../../lib/theme-choice'

interface CallControlsProps {
  onHangUp: () => void
  initialMicOn: boolean
  initialCameraOn: boolean
  chatOpen: boolean
  unread: number
  onChatPress: () => void
}

/** Mic, camera, chat, and hang-up. */
export function CallControls({
  onHangUp,
  initialMicOn,
  initialCameraOn,
  chatOpen,
  unread,
  onChatPress,
}: CallControlsProps) {
  const t = useTheme()
  const scheme = useResolvedScheme()
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
        <View style={{ position: 'relative' }}>
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
          {unread > 0 ? (
            <View
              accessibilityLabel={`${unread} unread ${unread === 1 ? 'message' : 'messages'}`}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                paddingHorizontal: 4,
                backgroundColor: t.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: t.onPrimary }}>
                {unread > 9 ? '9+' : unread}
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="Hang up"
          onPress={onHangUp}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: scheme === 'dark' ? t.errorContainer : t.error,
          }}
        >
          <PhoneOff size={20} color="#fff" strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  )
}

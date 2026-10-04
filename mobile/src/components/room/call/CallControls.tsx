import { useEffect, useState } from 'react'
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native'
import { useConnectionState, useLocalParticipant, useRoomContext } from '@livekit/react-native'
import { ConnectionState } from 'livekit-client'
import { Mic, MicOff, MessageSquare, PhoneOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react-native'
import { hasExternalAudioOutputLive, setSpeakerEnabledLive } from '../../../lib/call-audio'
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

/** Mic, camera, speaker, chat, and hang-up. */
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
  const room = useRoomContext()
  const connection = useConnectionState()
  const live = connection === ConnectionState.Connected
  const [micOn, setMicOn] = useState(initialMicOn)
  const [cameraOn, setCameraOn] = useState(initialCameraOn)
  const [speakerOn, setSpeakerOn] = useState(true)

  // Setup routes to the speaker unless an external device is connected, in
  // which case the toggle starts off so it reflects the actual route. iOS
  // cannot report external devices, so the toggle keeps its speaker default.
  useEffect(() => {
    let cancelled = false
    void hasExternalAudioOutputLive(Platform.OS).then((external) => {
      if (!cancelled && external) setSpeakerOn(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function toggleMic() {
    const next = !micOn
    setMicOn(next)
    try {
      await localParticipant.setMicrophoneEnabled(next)
      AccessibilityInfo.announceForAccessibility(next ? 'Microphone on' : 'Microphone muted')
    } catch {
      setMicOn(!next)
    }
  }

  async function toggleCamera() {
    const next = !cameraOn
    setCameraOn(next)
    try {
      await localParticipant.setCameraEnabled(next)
      AccessibilityInfo.announceForAccessibility(next ? 'Camera on' : 'Camera off')
    } catch {
      setCameraOn(!next)
    }
  }

  // Hang-up must disconnect LiveKit explicitly: the call screen lives in a
  // tab navigator that keeps routes mounted, so relying on unmount alone
  // leaves the media connection alive in the background and remote clients
  // keep a muted, no-network ghost tile until the server times it out.
  // Fire-and-forget so a stalled disconnect never blocks leaving; the parent
  // releases the server seat and unmounts the session regardless.
  function handleHangUp() {
    void room?.disconnect()?.catch(() => {})
    onHangUp()
  }

  async function toggleSpeaker() {
    const next = !speakerOn
    setSpeakerOn(next)
    const applied = await setSpeakerEnabledLive(next, Platform.OS)
    if (!applied) {
      setSpeakerOn(!next)
    } else {
      AccessibilityInfo.announceForAccessibility(next ? 'Speaker on' : 'Speaker off')
    }
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
            accessibilityHint={b.label === 'Mute' || b.label === 'Unmute' ? 'Double tap to toggle your microphone' : 'Double tap to toggle your camera'}
            accessibilityState={{ selected: b.on, disabled: !live }}
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
          accessibilityLabel={speakerOn ? 'Speaker off' : 'Speaker on'}
          accessibilityHint="Double tap to toggle the speaker"
          accessibilityState={{ selected: speakerOn, disabled: !live }}
          onPress={() => void toggleSpeaker()}
          disabled={!live}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: speakerOn ? t.primary : t.surfaceHighest,
            opacity: live ? 1 : 0.6,
          }}
        >
          {speakerOn ? (
            <Volume2 size={20} color="#fff" strokeWidth={2} />
          ) : (
            <VolumeX size={20} color="#fff" strokeWidth={2} />
          )}
        </Pressable>
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
                end: 4,
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
          onPress={handleHangUp}
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

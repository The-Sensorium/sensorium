import { useState } from 'react'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera'
import { Mic, MicOff, Video, VideoOff } from 'lucide-react-native'
import { radii } from '../../../lib/theme-tokens'
import { useTheme } from '../../../lib/use-theme'

export interface PreJoinChoices {
  mic: boolean
  camera: boolean
}

interface PreJoinProps {
  initialMicOn: boolean
  initialCameraOn: boolean
  onJoin(choices: PreJoinChoices): void
  onCancel(): void
}

/**
 * Pre-join sheet: explains mic/camera use before the OS prompt, requests
 * permissions, and lets the caller choose devices before connecting. Calls are
 * audio-first on mobile, so the camera starts off. Denied permissions narrow
 * the join (audio-only / muted) instead of blocking it.
 */
export function PreJoin({ initialMicOn, initialCameraOn, onJoin, onCancel }: PreJoinProps) {
  const t = useTheme()
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [micPermission, requestMicPermission] = useMicrophonePermissions()
  const [mic, setMic] = useState(initialMicOn)
  const [camera, setCamera] = useState(initialCameraOn)
  const [requesting, setRequesting] = useState(false)

  const cameraResolved =
    cameraPermission !== null && cameraPermission.status !== 'undetermined'
  const micResolved = micPermission !== null && micPermission.status !== 'undetermined'
  const camGranted = cameraPermission?.status === 'granted'
  const micGranted = micPermission?.status === 'granted'

  async function requestPermissions() {
    setRequesting(true)
    try {
      await Promise.all([requestCameraPermission(), requestMicPermission()])
    } catch {
      // Denial surfaces through the permission state above; nothing to do here.
    } finally {
      setRequesting(false)
    }
  }

  function openSettings() {
    void Linking.openSettings()
  }

  const toggleBase = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: t.surfaceContainer,
    borderRadius: radii.xl,
    paddingHorizontal: 16,
    paddingVertical: 12,
  }

  if (!cameraResolved || !micResolved) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: t.onSurface, textAlign: 'center' }}>
            Join the call
          </Text>
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant, textAlign: 'center' }}>
            Calls use your microphone and, if you turn it on, your camera. Your
            camera starts off.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Continue"
          onPress={() => void requestPermissions()}
          disabled={requesting}
          style={{
            backgroundColor: t.primary,
            borderRadius: radii.pill,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: requesting ? 0.6 : 1,
          }}
        >
          {requesting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Continue</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityLabel="Cancel"
          onPress={onCancel}
          style={{ alignItems: 'center', paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>Cancel</Text>
        </Pressable>
      </View>
    )
  }

  const toggles = [
    {
      key: 'mic',
      label: 'Microphone',
      on: mic,
      granted: micGranted,
      onPress: () => setMic((v) => !v),
      onIcon: <Mic size={20} color="#fff" strokeWidth={2} />,
      offIcon: <MicOff size={20} color={t.onSurfaceVariant} strokeWidth={2} />,
    },
    {
      key: 'camera',
      label: 'Camera',
      on: camera,
      granted: camGranted,
      onPress: () => setCamera((v) => !v),
      onIcon: <Video size={20} color="#fff" strokeWidth={2} />,
      offIcon: <VideoOff size={20} color={t.onSurfaceVariant} strokeWidth={2} />,
    },
  ]

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: t.onSurface, textAlign: 'center' }}>
        Join the call
      </Text>
      {toggles.map((toggle) => (
        <View key={toggle.key} style={{ gap: 4 }}>
          <View style={toggleBase}>
            <Pressable
              accessibilityLabel={toggle.on ? `Turn ${toggle.label} off` : `Turn ${toggle.label} on`}
              onPress={toggle.onPress}
              disabled={!toggle.granted}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: toggle.on && toggle.granted ? t.primary : t.surfaceHighest,
                opacity: toggle.granted ? 1 : 0.6,
              }}
            >
              {toggle.on && toggle.granted ? toggle.onIcon : toggle.offIcon}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                {toggle.label}
              </Text>
              {!toggle.granted ? (
                <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                  {toggle.key === 'camera'
                    ? 'Camera unavailable — you will join audio-only.'
                    : 'Microphone unavailable — you will join muted.'}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      ))}
      {(!camGranted || !micGranted) && (
        <Pressable
          accessibilityLabel="Open settings"
          onPress={openSettings}
          style={{ alignItems: 'center', paddingVertical: 4 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.primary }}>
            Open settings to enable access
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityLabel="Join call"
        onPress={() => onJoin({ mic: mic && micGranted, camera: camera && camGranted })}
        style={{
          backgroundColor: t.primary,
          borderRadius: radii.pill,
          paddingVertical: 14,
          alignItems: 'center',
          marginTop: 8,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Join call</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Cancel"
        onPress={onCancel}
        style={{ alignItems: 'center', paddingVertical: 8 }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>Cancel</Text>
      </Pressable>
    </View>
  )
}

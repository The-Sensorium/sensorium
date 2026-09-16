import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native'
import { BellRing } from 'lucide-react-native'
import {
  getPushPermission,
  requestPushPermissionAndRegister,
  type PushPermissionStatus,
} from '../lib/push'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

export function PushPermissionPrompt({ compact }: { compact?: boolean }) {
  const t = useTheme()
  const [status, setStatus] = useState<PushPermissionStatus | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [asked, setAsked] = useState(false)

  const refresh = useCallback(() => {
    void getPushPermission().then(setStatus)
  }, [])

  useEffect(() => {
    refresh()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => sub.remove()
  }, [refresh])

  async function enable() {
    setRequesting(true)
    try {
      const next = await requestPushPermissionAndRegister()
      setStatus(next)
      if (next === 'denied') setAsked(true)
    } finally {
      setRequesting(false)
    }
  }

  if (status === null || status === 'granted' || status === 'unavailable') return null

  // Android reports `denied` on fresh installs where notifications are off by
  // default but the system dialog was never shown, and the first request
  // still prompts. Only send to system settings once a request has been
  // declined (iOS never re-prompts after a denial, so go there directly).
  const showSettings = status === 'denied' && (asked || Platform.OS === 'ios')

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: t.surfaceContainer,
        borderWidth: 1,
        borderColor: t.outlineVariant,
        borderRadius: radii.md,
        padding: compact ? 12 : 16,
        marginBottom: compact ? 12 : 16,
      }}
    >
      <BellRing size={20} color={t.primary} strokeWidth={1.5} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
          {showSettings ? 'Notifications are off' : 'Stay in the loop'}
        </Text>
        <Text style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: t.onSurfaceVariant }}>
          {showSettings
            ? 'You declined notifications. Open settings to turn them back on.'
            : 'Enable notifications to hear about messages, mentions, and invites.'}
        </Text>
      </View>
      {showSettings ? (
        <Pressable
          accessibilityLabel="Open settings"
          onPress={() => void Linking.openSettings()}
          style={{
            borderWidth: 1,
            borderColor: t.primary,
            borderRadius: radii.pill,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>Settings</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel="Enable notifications"
          onPress={() => void enable()}
          disabled={requesting}
          style={{
            backgroundColor: t.primary,
            borderRadius: radii.pill,
            paddingHorizontal: 16,
            paddingVertical: 10,
            opacity: requesting ? 0.6 : 1,
          }}
        >
          {requesting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Enable</Text>
          )}
        </Pressable>
      )}
    </View>
  )
}

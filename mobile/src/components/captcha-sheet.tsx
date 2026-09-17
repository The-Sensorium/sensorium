import { useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native'
import * as Linking from 'expo-linking'
import {
  WebView,
  type WebViewMessageEvent,
} from 'react-native-webview'
import { useTheme } from '../lib/use-theme'
import { isAllowedChallengeNavigation, parseChallengeToken } from '../lib/captcha'
import { radii, spacing } from '../lib/theme-tokens'

export function CaptchaSheet({
  challengeUrl,
  onToken,
  onClose,
}: {
  challengeUrl: string
  onToken: (token: string) => void
  onClose: () => void
}) {
  const t = useTheme()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const delivered = useRef(false)

  let allowedOrigin: string | null = null
  try {
    allowedOrigin = new URL(challengeUrl).origin
  } catch {
    allowedOrigin = null
  }

  function handleMessage(event: WebViewMessageEvent) {
    if (delivered.current) return
    const token = parseChallengeToken(event.nativeEvent.data)
    if (token) {
      delivered.current = true
      onToken(token)
    }
  }

  function shouldStartLoad(event: { url: string }): boolean {
    if (allowedOrigin && isAllowedChallengeNavigation(event.url, allowedOrigin)) return true
    if (!allowedOrigin) return true
    void Linking.openURL(event.url).catch(() => {})
    return false
  }

  function retry() {
    setFailed(false)
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.background }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.containerMargin,
            paddingVertical: 12,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: t.onSurface }}>
            Human verification
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel verification"
            onPress={onClose}
            style={{ padding: 8 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>Cancel</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <WebView
            key={reloadKey}
            source={{ uri: challengeUrl }}
            onMessage={handleMessage}
            onShouldStartLoadWithRequest={shouldStartLoad}
            // Turnstile risk assessment needs DOM storage and third-party cookies.
            domStorageEnabled
            thirdPartyCookiesEnabled
            onLoadStart={() => {
              setLoading(true)
              setFailed(false)
            }}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false)
              setFailed(true)
            }}
            onHttpError={() => {
              setLoading(false)
              setFailed(true)
            }}
            style={{ flex: 1, backgroundColor: t.background }}
          />
          {loading && !failed ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                paddingTop: 32,
                alignItems: 'center',
              }}
            >
              <ActivityIndicator size="large" color={t.primary} />
            </View>
          ) : null}
          {failed ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.containerMargin, backgroundColor: t.background }}>
              <Text style={{ fontSize: 14, color: t.error, textAlign: 'center' }}>
                Human verification failed to load. Check your connection and try again.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry verification"
                onPress={retry}
                style={{
                  marginTop: 16,
                  borderRadius: radii.pill,
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  backgroundColor: t.primary,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onPrimary }}>
                  Retry verification
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

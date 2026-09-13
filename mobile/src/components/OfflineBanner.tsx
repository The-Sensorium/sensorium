import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WifiOff } from 'lucide-react-native'
import { useOnline } from '../lib/use-online'
import { useTheme } from '../lib/use-theme'

export function OfflineBanner() {
  const online = useOnline()
  const t = useTheme()
  const insets = useSafeAreaInsets()

  if (online) return null
  return (
    <View
      testID="offline-banner"
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: t.error, paddingTop: insets.top }]}
    >
      <WifiOff size={16} color={t.onError} />
      <Text style={[styles.text, { color: t.onError }]}>
        You&apos;re offline. Updates will load when you reconnect.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
})

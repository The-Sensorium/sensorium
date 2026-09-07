import { Image, Text, View } from 'react-native'
import { useAvatarUrl } from '../features/avatars'
import { useTheme } from '../lib/use-theme'

export function Avatar({ name, src, size = 28 }: { name: string; src?: string | null; size?: number }) {
  const t = useTheme()
  const { data: resolved } = useAvatarUrl(src)
  if (resolved) {
    return (
      <Image
        source={{ uri: resolved }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.surfaceContainer }}
      />
    )
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.surfaceContainer,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontWeight: '600', fontSize: size * 0.45, color: t.primary }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  )
}

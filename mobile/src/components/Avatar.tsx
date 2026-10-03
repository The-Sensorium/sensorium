import { Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useAvatarUrl } from '../features/avatars'
import { useTheme } from '../lib/use-theme'

export function Avatar({ name, src, size = 28 }: { name: string; src?: string | null; size?: number }) {
  const t = useTheme()
  const { data: resolved } = useAvatarUrl(src)
  if (resolved) {
    return (
      <Image
        source={{ uri: resolved }}
        accessibilityLabel={`${name}'s avatar`}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.surfaceContainer }}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={resolved}
        transition={200}
      />
    )
  }
  // Tinted (not surfaceContainer) so the circle stays visible on every
  // background, including surfaceContainer cards. Mirrors the web fallback.
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: size / 2,
          backgroundColor: t.primary,
          opacity: 0.2,
        }}
      />
      <Text style={{ fontWeight: '600', fontSize: size * 0.45, color: t.primary }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  )
}

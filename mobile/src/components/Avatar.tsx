import { useState } from 'react'
import { Text, View } from 'react-native'
import { Image } from 'expo-image'
import { avatarFullFor, avatarThumbFor, useAvatarFullUrl, useAvatarThumbUrl } from '../features/avatars'
import { useTheme } from '../lib/use-theme'
import { useClusterAccentText } from '../lib/cluster-theme'

export function Avatar({ name, src, thumbSrc, size = 28 }: { name: string; src?: string | null; thumbSrc?: string | null; size?: number }) {
  const t = useTheme()
  const accentText = useClusterAccentText() ?? t.primary
  // Same resilient fallback as the web Avatar: a derived thumb path that
  // does not exist fails at signing time, so fall back on query error as
  // well as on image load error.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const thumb = thumbSrc ?? avatarThumbFor(src) ?? src
  const full = avatarFullFor(src) ?? src ?? thumb
  const thumbQuery = useAvatarThumbUrl(thumb, src)
  const thumbFailed = thumbQuery.isError || failedSrc === thumbQuery.data
  const { data: fullUrl } = useAvatarFullUrl(full, thumb, { enabled: thumbFailed })
  const resolved = thumbFailed && fullUrl ? fullUrl : thumbQuery.data
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
        onError={() => setFailedSrc(thumbQuery.data ?? null)}
      />
    )
  }
  // Tinted (not surfaceContainer) so the circle stays visible on every
  // background, including surfaceContainer cards. Mirrors the web fallback.
  // The 12% weight keeps accent initials above AA against the tint.
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
          opacity: 0.12,
        }}
      />
      <Text style={{ fontWeight: '600', fontSize: size * 0.45, color: accentText }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  )
}

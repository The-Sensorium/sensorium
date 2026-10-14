import { useState } from 'react'
import { Text, View } from 'react-native'
import { Image } from 'expo-image'
import { avatarFullFor, useAvatarFullUrl, useAvatarThumbUrl } from '../features/avatars'
import { useTheme } from '../lib/use-theme'
import { useClusterAccentText } from '../lib/cluster-theme'

export function Avatar({ name, src, thumbSrc, size = 28 }: { name: string; src?: string | null; thumbSrc?: string | null; size?: number }) {
  const t = useTheme()
  const accentText = useClusterAccentText() ?? t.primary
  // The thumb is only requested when the caller threads the explicit
  // `avatar_thumb_url` column through. Guessing it from the full path by
  // swapping the extension is wrong whenever the pair was stored with mixed
  // extensions (full JPG + thumb WebP): the signature for the guessed path
  // fails on every mount and the image visibly reloads on each navigation.
  // Without an explicit thumb the stored path itself is loaded directly, as
  // before the dual-variant upgrade.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const thumb = thumbSrc ?? src
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

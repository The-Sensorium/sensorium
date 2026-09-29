import { useEffect, useState } from 'react'
import { ActivityIndicator, Image as RNImage, Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useChatImageUrl } from '../../features/cluster'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { ZoomableImage } from '../ZoomableImage'

/** Longest chat image edge: portraits are height-capped instead of
 * full-bleed so one photo cannot push the conversation off screen. */
const MAX_CHAT_IMAGE_HEIGHT = 320

function useNaturalSize(uri: string | undefined) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    setSize(null)
    if (!uri) return
    let live = true
    RNImage.getSize(
      uri,
      (width, height) => {
        if (live && width > 0 && height > 0) setSize({ width, height })
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [uri])
  return size
}

/** Display box that hugs the image: full-bleed exact fit for
 * landscape/square (height-capped like before), height-capped and centered
 * for portraits. No forced boxes, so no letterboxing; never crops. */
function chatImageStyle(natural: { width: number; height: number } | null, fallbackRatio: number) {
  if (!natural) return { width: '100%' as const, aspectRatio: fallbackRatio }
  if (natural.width >= natural.height) {
    return {
      width: '100%' as const,
      aspectRatio: natural.width / natural.height,
      maxHeight: MAX_CHAT_IMAGE_HEIGHT,
    }
  }
  return {
    height: MAX_CHAT_IMAGE_HEIGHT,
    aspectRatio: natural.width / natural.height,
    maxWidth: '100%' as const,
    alignSelf: 'center' as const,
  }
}

export function MessageImage({
  path,
  alt,
  onLongPress,
}: {
  path: string
  alt: string
  onLongPress?: () => void
}) {
  const t = useTheme()
  const { data: src, isError, isLoading } = useChatImageUrl(path)
  const [open, setOpen] = useState(false)
  const natural = useNaturalSize(src ?? undefined)

  if (isError || (!isLoading && !src)) {
    return (
      <View
        style={{
          height: 128,
          borderRadius: radii.md,
          backgroundColor: t.surfaceContainer,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>Image unavailable</Text>
      </View>
    )
  }
  if (!src) {
    return (
      <View style={{ height: 128, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={t.primary} />
      </View>
    )
  }
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityLabel="View image full size"
      >
        <Image
          source={{ uri: src }}
          accessibilityLabel={alt}
          style={{ ...chatImageStyle(natural, 4 / 3), borderRadius: radii.md }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={200}
        />
      </Pressable>
      <ZoomableImage uri={src} accessibilityLabel={alt} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function MessageGif({ src, onLongPress }: { src: string; onLongPress?: () => void }) {
  const [open, setOpen] = useState(false)
  const natural = useNaturalSize(src)

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityLabel="View image full size"
      >
        <Image
          source={{ uri: src }}
          accessibilityLabel="GIF"
          style={{ ...chatImageStyle(natural, 16 / 9), borderRadius: radii.md }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={200}
        />
      </Pressable>
      <ZoomableImage uri={src} accessibilityLabel="GIF" open={open} onClose={() => setOpen(false)} />
    </>
  )
}

import { useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
import { useChatImageUrl } from '../../features/cluster'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { ZoomableImage } from '../ZoomableImage'

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
          style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radii.md }}
          resizeMode="contain"
        />
      </Pressable>
      <ZoomableImage uri={src} accessibilityLabel={alt} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function MessageGif({ src, onLongPress }: { src: string; onLongPress?: () => void }) {
  const [open, setOpen] = useState(false)
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
          style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md }}
          resizeMode="cover"
        />
      </Pressable>
      <ZoomableImage uri={src} accessibilityLabel="GIF" open={open} onClose={() => setOpen(false)} />
    </>
  )
}

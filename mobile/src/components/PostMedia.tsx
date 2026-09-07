import { useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
import { Image as ImageIcon } from 'lucide-react-native'
import { usePostImageUrl } from '../features/posts'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { ZoomableImage } from './ZoomableImage'

export function PostMedia({
  imageUrl,
  gifUrl,
  alt,
  compact,
}: {
  imageUrl?: string | null
  gifUrl?: string | null
  alt?: string
  compact?: boolean
}) {
  const t = useTheme()
  const { data: signedUrl } = usePostImageUrl(imageUrl ?? null)
  const src = gifUrl ?? signedUrl ?? null
  const [open, setOpen] = useState(false)

  if (!src) {
    if (!compact) return null
    return (
      <View
        style={{ marginTop: 12, height: 176, borderRadius: radii.xl, backgroundColor: t.surfaceContainer, alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <ImageIcon size={32} color={t.onSurfaceVariant} strokeWidth={1.5} />
        <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>No image</Text>
      </View>
    )
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel="View image full size">
        <Image
          source={{ uri: src }}
          accessibilityLabel={alt ?? 'Shared media'}
          style={{
            marginTop: 12,
            width: '100%',
            height: compact ? 176 : 300,
            borderRadius: radii.xl,
            backgroundColor: t.surfaceContainer,
          }}
          resizeMode={compact ? 'cover' : 'contain'}
        />
      </Pressable>
      <ZoomableImage
        uri={src}
        accessibilityLabel={alt ?? 'Shared media'}
        open={open}
        onClose={() => setOpen(false)}
      />
      {signedUrl === undefined && !gifUrl ? (
        <ActivityIndicator size="small" color={t.primary} />
      ) : null}
    </>
  )
}

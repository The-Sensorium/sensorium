import { useEffect, useState } from 'react'
import { ActivityIndicator, Image as RNImage, Pressable } from 'react-native'
import { Image } from 'expo-image'
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
  const [aspect, setAspect] = useState<number | null>(null)

  useEffect(() => {
    setAspect(null)
    if (!src) return
    let live = true
    RNImage.getSize(
      src,
      (width, height) => {
        if (live && width > 0 && height > 0) setAspect(width / height)
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [src])

  if (!src) return null

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel="View image full size">
        <Image
          source={{ uri: src }}
          accessibilityLabel={alt ?? 'Shared media'}
          style={
            aspect
              ? {
                  marginTop: 12,
                  width: '100%',
                  aspectRatio: aspect,
                  maxHeight: 420,
                  borderRadius: radii.xl,
                  backgroundColor: t.surfaceContainer,
                }
              : {
                  marginTop: 12,
                  width: '100%',
                  height: compact ? 176 : 300,
                  borderRadius: radii.xl,
                  backgroundColor: t.surfaceContainer,
                }
          }
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={200}
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

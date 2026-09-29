import { useEffect, useState } from 'react'
import { Image as RNImage, Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { Expand } from 'lucide-react-native'
import { usePostImageUrl } from '../features/posts'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { ZoomableImage } from './ZoomableImage'

/** Feed portrait ceiling (Instagram 4:5 standard): taller images are center-
 * cropped in the preview and open full-size on tap, so one long screenshot
 * cannot push the rest of the feed off screen. */
const MAX_PORTRAIT_ASPECT = 4 / 5
/** Never cover-crop a source narrower than this: magnifying a small image
 * into the 4:5 crop looks softer than showing the whole frame. Needs roughly
 * 2x the ~350pt card width for retina sharpness. */
const MIN_COVER_WIDTH = 700

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
  const [sourceWidth, setSourceWidth] = useState(0)
  const [sizingFailed, setSizingFailed] = useState(false)

  useEffect(() => {
    setAspect(null)
    setSourceWidth(0)
    setSizingFailed(false)
    if (!src) return
    let live = true
    RNImage.getSize(
      src,
      (width, height) => {
        if (live && width > 0 && height > 0) {
          setAspect(width / height)
          setSourceWidth(width)
        }
      },
      () => {
        if (live) setSizingFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [src])

  if (!src) return null

  const tall = aspect !== null && aspect < MAX_PORTRAIT_ASPECT && sourceWidth >= MIN_COVER_WIDTH
  const previewAspect = tall ? MAX_PORTRAIT_ASPECT : aspect

  // Reserve space while measuring so the image mounts once at its final
  // size. Mounting it first in the small fallback box lets the native
  // decoder cache a low-res bitmap that gets upscaled after the layout
  // jumps to the measured aspect (blurry feed previews).
  if (!previewAspect && !sizingFailed) {
    return (
      <View
        style={{
          marginTop: 12,
          width: '100%',
          height: compact ? 176 : 300,
          borderRadius: radii.xl,
          backgroundColor: t.surfaceContainer,
        }}
      />
    )
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={tall ? 'Long image, tap to view full size' : 'View image full size'}
      >
        <Image
          source={{ uri: src }}
          accessibilityLabel={alt ?? 'Shared media'}
          style={
            previewAspect
              ? {
                  marginTop: 12,
                  width: '100%',
                  aspectRatio: previewAspect,
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
          contentFit={tall ? 'cover' : 'contain'}
          cachePolicy="memory-disk"
          transition={200}
        />
        {tall ? (
          <View
            accessible={false}
            style={{
              position: 'absolute',
              end: 12,
              bottom: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'rgba(0,0,0,0.65)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.35)',
              borderRadius: radii.pill,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Expand size={12} color="#fff" strokeWidth={2} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>Full image</Text>
          </View>
        ) : null}
      </Pressable>
      <ZoomableImage
        uri={src}
        accessibilityLabel={alt ?? 'Shared media'}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

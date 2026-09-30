import { useEffect, useState } from 'react'
import { Expand, X } from 'lucide-react'
import { usePostImageUrl } from '../features/posts'
import { cn } from '../lib/utils'

/** Feed portrait ceiling (Instagram 4:5 standard, mirrors mobile): taller
 * images are center-cropped in the preview and open full-size on tap, so one
 * long screenshot cannot push the rest of the feed off screen. */
const MAX_PORTRAIT_ASPECT = 4 / 5
/** Never cover-crop a source narrower than this: magnifying a small image
 * into the 4:5 crop looks softer than showing the whole frame. */
const MIN_COVER_WIDTH = 700

/** Renders a post/comment's single media: a remote GIF or an uploaded image.
 * Tapping the image opens a full-screen lightbox. */
export function PostMedia({  imageUrl,
  gifUrl,
  alt,
  className,
  compact,
}: {
  imageUrl?: string | null
  gifUrl?: string | null
  alt?: string
  className?: string
  compact?: boolean
}) {
  const { data: signedUrl } = usePostImageUrl(imageUrl ?? null)
  const src = gifUrl ?? signedUrl ?? null
  const [open, setOpen] = useState(false)
  // Natural ratio is only needed for full (detail) views. Compact previews
  // use a fixed 16:9 crop so one tall photo cannot dominate a feed.
  const [aspect, setAspect] = useState<number | null>(null)
  const [sourceWidth, setSourceWidth] = useState(0)

  useEffect(() => {
    setAspect(null)
    setSourceWidth(0)
  }, [src])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  if (!src) return null

  const tall = aspect !== null && aspect < MAX_PORTRAIT_ASPECT && sourceWidth >= MIN_COVER_WIDTH

  return (
    <>
      <button
        type="button"
        aria-label={tall ? 'Long image, tap to view full size' : 'View image full size'}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className={cn('relative block w-full cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', className)}
      >
        <img
          src={src}
          alt={alt ?? 'Shared media'}
          loading="lazy"
          decoding="async"
          onLoad={(e) => {
            const im = e.currentTarget
            if (im.naturalWidth > 0 && im.naturalHeight > 0) {
              setAspect(im.naturalWidth / im.naturalHeight)
              setSourceWidth(im.naturalWidth)
            }
          }}
          style={!compact && aspect ? { aspectRatio: String(Math.max(aspect, MAX_PORTRAIT_ASPECT)) } : undefined}
          className={cn(
            'mt-3 w-full rounded-2xl border border-outline-variant/60 bg-surface-container',
            compact ? 'aspect-video object-cover' : aspect ? 'object-cover' : 'max-h-96 object-contain',
          )}
        />
        {tall ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-pill border border-white/35 bg-black/65 px-2.5 py-1.5 text-[11px] font-semibold text-white"
          >
            <Expand className="h-3 w-3" strokeWidth={2} aria-hidden /> Full image
          </span>
        ) : null}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-inverse-surface/90 p-4"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
          }}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
            }}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-surface/20 text-on-surface transition-colors hover:bg-surface/40"
          >
            <X className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </button>
          <img
            src={src}
            alt={alt ?? 'Shared media'}
            decoding="async"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] max-w-full rounded-2xl object-contain shadow-lift"
          />
        </div>
      )}
    </>
  )
}

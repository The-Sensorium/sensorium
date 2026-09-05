import { useEffect, useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'
import { usePostImageUrl } from '../features/posts'
import { cn } from '../lib/utils'

/** Renders a post/comment's single media: a remote GIF or an uploaded image.
 * Tapping the image opens a full-screen lightbox. */
export function PostMedia({
  imageUrl,
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

  if (!src) {
    if (!compact) return null
    return (
      <div
        aria-hidden
        className="mt-3 grid h-44 w-full place-items-center rounded-2xl border border-outline-variant/60 bg-surface-container"
      >
        <div className="flex flex-col items-center gap-2 text-outline">
          <ImageIcon className="h-8 w-8" strokeWidth={1.5} aria-hidden />
          <span className="text-xs">No image</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="View image full size"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        className={cn('block w-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', className)}
      >
        <img
          src={src}
          alt={alt ?? 'Shared media'}
          loading="lazy"
          className={cn(
            'mt-3 w-full rounded-2xl border border-outline-variant/60 bg-surface-container',
            compact ? 'h-44 object-cover' : 'max-h-96 object-contain',
          )}
        />
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
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] max-w-full rounded-2xl object-contain shadow-lift"
          />
        </div>
      )}
    </>
  )
}

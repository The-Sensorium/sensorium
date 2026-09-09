import { useChatImageUrl } from '../../../features/cluster'
import { ImagePreviewDialog } from './ImagePreview'
import { useImagePreview } from './useImagePreview'

export function MessageImage({ path, alt }: { path: string; alt: string }) {
  const { data: src, isError } = useChatImageUrl(path)
  const { open, setOpen } = useImagePreview()

  if (isError || !src) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl bg-surface-container text-sm text-on-surface-variant">
        Image unavailable
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
        className="block w-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="max-h-80 w-full rounded-xl object-contain"
        />
      </button>
      {open && <ImagePreviewDialog src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}

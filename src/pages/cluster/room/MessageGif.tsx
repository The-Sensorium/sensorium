import { ImagePreviewDialog } from './ImagePreview'
import { useImagePreview } from './useImagePreview'

export function MessageGif({ src }: { src: string }) {
  const { open, setOpen } = useImagePreview()

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
          alt="GIF"
          loading="lazy"
          className="max-h-80 w-full rounded-xl object-contain"
        />
      </button>
      {open && <ImagePreviewDialog src={src} alt="GIF" onClose={() => setOpen(false)} />}
    </>
  )
}

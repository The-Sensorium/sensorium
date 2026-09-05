import { X } from 'lucide-react'

export function ImagePreviewDialog({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose(): void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-inverse-surface/90 p-4"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }}
    >
      <button
        type="button"
        aria-label="Close preview"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }}
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-surface/20 text-on-surface transition-colors hover:bg-surface/40"
      >
        <X className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] max-w-full rounded-2xl object-contain shadow-lift"
      />
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Loader2 } from 'lucide-react'
import { Modal } from './Modal'
import { cropAvatarImage } from '../lib/image'
import { toErrorMessage } from '../lib/error'

export function AvatarCropModal({
  open,
  imageSrc,
  fileName,
  onClose,
  onCropped,
}: {
  open: boolean
  imageSrc: string | null
  fileName: string
  onClose: () => void
  onCropped: (file: File) => void
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixels, setPixels] = useState<Area | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A reopened modal must never reuse the previous photo's crop state;
  // saving before onCropComplete fires for the new image would crop with
  // stale coordinates.
  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setPixels(null)
      setError(null)
    }
  }, [open, imageSrc])

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setPixels(areaPixels)
  }, [])

  async function handleSave() {
    if (!imageSrc || !pixels) return
    setPending(true)
    setError(null)
    try {
      const file = await cropAvatarImage(imageSrc, pixels, fileName)
      onCropped(file)
    } catch (err) {
      setError(toErrorMessage(err, 'Could not crop that image. Try another photo.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Crop your photo">
      <div className="mt-4 space-y-4">
        {imageSrc ? (
          <div className="relative h-72 w-full overflow-hidden rounded-xl bg-inverse-surface">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
        ) : null}
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-on-surface">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="mt-1 w-full"
              aria-label="Zoom"
            />
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-[44px] flex-1 rounded-pill border border-outline-variant/70 px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={pending || !pixels}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Use photo
          </button>
        </div>
      </div>
    </Modal>
  )
}

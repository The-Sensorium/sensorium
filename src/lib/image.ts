const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface PrepareImageOptions {
  /** Longest edge, in px, that the image is downscaled to. */
  maxDimension?: number
  /** WebP encode quality, 0-1. */
  quality?: number
}

/**
 * Downscale + re-encode a user-picked image to WebP before upload.
 * Uploading a full-res JPEG and letting the browser downscale it at render
 * time produces grainy/aliased results at small display sizes, and wastes
 * storage. Images already at or below `maxDimension` are returned untouched.
 * Animated GIFs are returned untouched to preserve animation.
 */
export async function prepareImage(
  file: File,
  { maxDimension = 512, quality = 0.85 }: PrepareImageOptions = {},
): Promise<File> {
  if (file.type === 'image/gif' || !RESIZABLE.has(file.type)) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  const { width, height } = bitmap
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  if (scale >= 1) {
    bitmap.close()
    return file
  }

  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
  if (!blob) return file
  const name = file.name.replace(/\.[^.]+$/, '') + '.webp'
  return new File([blob], name, { type: 'image/webp' })
}

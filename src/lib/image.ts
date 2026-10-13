const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Longest edge for the fullscreen avatar variant shown in AvatarViewer. */
export const AVATAR_FULL_MAX_DIMENSION = 1024
/** Longest edge for the list thumbnail variant shown in Avatar. */
export const AVATAR_THUMB_MAX_DIMENSION = 256

export const AVATAR_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export const AVATAR_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024

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

/** Validate a picked avatar file; returns the error copy or null when valid. */
export function validateAvatarFile(file: File): string | null {
  if (file.type === 'image/heic' || file.type === 'image/heif') {
    return 'Please choose a JPG, PNG, WebP, or GIF image (HEIC is not supported yet).'
  }
  if (!(AVATAR_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return 'Please choose a JPG, PNG, WebP, or GIF image.'
  }
  if (file.size > AVATAR_UPLOAD_LIMIT_BYTES) {
    return 'That image is larger than 5 MB.'
  }
  return null
}

export interface AvatarVariants {
  full: File
  thumb: File
}

async function canvasToWebP(
  source: CanvasImageSource,
  w: number,
  h: number,
  name: string,
  quality: number,
): Promise<File | null> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
  if (!blob) return null
  return new File([blob], name, { type: 'image/webp' })
}

/**
 * Build the dual avatar variants from a cropped square file.
 * Full is capped at 1024px for the viewer; thumb is drawn from the full
 * canvas at 256px for lists. GIFs and non-resizable files return the same
 * file for both variants to preserve animation.
 */
export async function prepareAvatarVariants(
  file: File,
  { quality = 0.85 }: { quality?: number } = {},
): Promise<AvatarVariants> {
  if (file.type === 'image/gif' || !RESIZABLE.has(file.type)) {
    return { full: file, thumb: file }
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { full: file, thumb: file }
  }

  const { width, height } = bitmap
  const longest = Math.max(width, height)
  const base = file.name.replace(/\.[^.]+$/, '')
  if (longest <= AVATAR_THUMB_MAX_DIMENSION) {
    bitmap.close()
    return { full: file, thumb: file }
  }
  if (longest <= AVATAR_FULL_MAX_DIMENSION) {
    const thumbScale = AVATAR_THUMB_MAX_DIMENSION / longest
    const thumb = await canvasToWebP(
      bitmap,
      width * thumbScale,
      height * thumbScale,
      `${base}_thumb.webp`,
      quality,
    )
    bitmap.close()
    if (!thumb) return { full: file, thumb: file }
    return { full: file, thumb }
  }

  const fullScale = AVATAR_FULL_MAX_DIMENSION / longest
  const fullW = Math.max(1, Math.round(width * fullScale))
  const fullH = Math.max(1, Math.round(height * fullScale))
  const fullCanvas = document.createElement('canvas')
  fullCanvas.width = fullW
  fullCanvas.height = fullH
  const fullCtx = fullCanvas.getContext('2d')
  if (!fullCtx) {
    bitmap.close()
    return { full: file, thumb: file }
  }
  fullCtx.imageSmoothingEnabled = true
  fullCtx.imageSmoothingQuality = 'high'
  fullCtx.drawImage(bitmap, 0, 0, fullW, fullH)
  bitmap.close()

  const fullBlob = await new Promise<Blob | null>((resolve) =>
    fullCanvas.toBlob(resolve, 'image/webp', quality),
  )
  if (!fullBlob) return { full: file, thumb: file }
  const full = new File([fullBlob], `${base}_full.webp`, { type: 'image/webp' })

  const thumbScale = Math.min(1, AVATAR_THUMB_MAX_DIMENSION / Math.max(fullW, fullH))
  if (thumbScale >= 1) {
    return { full, thumb: full }
  }
  const thumb = await canvasToWebP(
    fullCanvas,
    fullW * thumbScale,
    fullH * thumbScale,
    `${base}_thumb.webp`,
    quality,
  )
  if (!thumb) return { full, thumb: full }
  return { full, thumb }
}

export interface CropPixels {
  x: number
  y: number
  width: number
  height: number
}

/** Crop a square region out of an object URL image; used by the crop modal. */
export async function cropAvatarImage(
  imageSrc: string,
  pixels: CropPixels,
  fileName = 'avatar.jpg',
): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not read that image. Try another photo.'))
    el.src = imageSrc
  })
  const size = Math.max(1, Math.round(Math.min(pixels.width, pixels.height)))
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read that image. Try another photo.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    img,
    Math.max(0, Math.round(pixels.x)),
    Math.max(0, Math.round(pixels.y)),
    Math.round(pixels.width),
    Math.round(pixels.height),
    0,
    0,
    size,
    size,
  )
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.95),
  )
  if (!blob) throw new Error('Could not read that image. Try another photo.')
  return new File([blob], fileName, { type: 'image/jpeg' })
}

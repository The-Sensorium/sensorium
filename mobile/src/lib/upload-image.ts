import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { File as ExpoFile } from 'expo-file-system'
import { cacheDirectory, copyAsync } from 'expo-file-system/legacy'
import { requireSupabase } from './supabase'

/** Longest edge for the fullscreen avatar variant shown in AvatarViewer. */
export const AVATAR_FULL_MAX_DIMENSION = 1024
/** Longest edge for the list thumbnail variant shown in Avatar. */
export const AVATAR_THUMB_MAX_DIMENSION = 256
/** Kept for existing imports; equals the thumbnail dimension. */
export const AVATAR_MAX_DIMENSION = AVATAR_THUMB_MAX_DIMENSION

export const AVATAR_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024

export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number]

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const READ_TIMEOUT_MS = 30_000

const ALLOWED_BUCKETS = new Set(['avatars', 'chat-images', 'posts-images'])
const PATH_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.[a-z0-9]+$/

/** Crypto-safe id for storage paths; falls back when `globalThis.crypto` is missing (Android Hermes). */
export function newStorageId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => void } }
  try {
    const uuid = g.crypto?.randomUUID?.()
    if (uuid) return uuid
  } catch {
  }
  try {
    const bytes = new Uint8Array(16)
    g.crypto?.getRandomValues?.(bytes)
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    if (hex.replace(/0/g, '')) {
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
    }
  } catch {
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
}

export function assertAllowedMime(mime: string): asserts mime is AllowedImageMime {
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) {
    throw new Error('Please choose a JPG, PNG, WebP, or GIF image.')
  }
}

export function extFor(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  throw new Error('Please choose a JPG, PNG, WebP, or GIF image.')
}

/** Validate a picked avatar asset; returns the error copy or null when valid. */
export function validateAvatarAsset(mime: string, fileSize?: number | null): string | null {
  if (mime === 'image/heic' || mime === 'image/heif') {
    return 'Please choose a JPG, PNG, WebP, or GIF image (HEIC is not supported yet).'
  }
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) {
    return 'Please choose a JPG, PNG, WebP, or GIF image.'
  }
  if (typeof fileSize === 'number' && fileSize > AVATAR_UPLOAD_LIMIT_BYTES) {
    return 'That image is larger than 5 MB.'
  }
  return null
}

export function storagePath(prefix: string, ext: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(prefix)) throw new Error('Invalid upload destination.')
  if (!/^[a-z0-9]+$/.test(ext)) throw new Error('Invalid upload destination.')
  return prefix + '/' + newStorageId() + '.' + ext
}

export function assertStoragePath(path: string): void {
  if (!PATH_RE.test(path) || path.includes('..')) {
    throw new Error('Invalid stored image path.')
  }
}

export function sanitizeStoredPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.includes('..')) return null
  if (!PATH_RE.test(raw)) return null
  return raw
}

export async function maybeResize(
  uri: string,
  mime: string,
  width: number,
  height: number,
  maxDimension: number,
): Promise<{ uri: string; mime: string }> {
  assertAllowedMime(mime)
  if (mime === 'image/gif') return { uri, mime }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { uri, mime }
  }
  if (Math.max(width, height) <= maxDimension) return { uri, mime }
  try {
    const action = width >= height ? { resize: { width: maxDimension } } : { resize: { height: maxDimension } }
    const out = await manipulateAsync(uri, [action], {
      compress: 0.85,
      format: SaveFormat.WEBP,
    })
    if (!out?.uri) return { uri, mime }
    if (typeof out.width === 'number' && typeof out.height === 'number') {
      if (!Number.isFinite(out.width) || !Number.isFinite(out.height) || out.width <= 0 || out.height <= 0) {
        return { uri, mime }
      }
    }
    return { uri: out.uri, mime: 'image/webp' }
  } catch {
    return { uri, mime }
  }
}

export interface AvatarPair {
  fullUri: string
  fullMime: string
  thumbUri: string
  thumbMime: string
}

/**
 * Build the dual avatar variants from a picked asset.
 * Full is capped at 1024px; thumb is drawn from the full output at 256px.
 * GIFs and small images return the same uri for both sides.
 */
export async function prepareAvatarPair(
  uri: string,
  mime: string,
  width: number,
  height: number,
): Promise<AvatarPair> {
  assertAllowedMime(mime)
  if (mime === 'image/gif') return { fullUri: uri, fullMime: mime, thumbUri: uri, thumbMime: mime }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { fullUri: uri, fullMime: mime, thumbUri: uri, thumbMime: mime }
  }
  if (Math.max(width, height) <= AVATAR_THUMB_MAX_DIMENSION) {
    return { fullUri: uri, fullMime: mime, thumbUri: uri, thumbMime: mime }
  }
  if (Math.max(width, height) <= AVATAR_FULL_MAX_DIMENSION) {
    const thumb = await maybeResize(uri, mime, width, height, AVATAR_THUMB_MAX_DIMENSION)
    return { fullUri: uri, fullMime: mime, thumbUri: thumb.uri, thumbMime: thumb.mime }
  }
  const full = await maybeResize(uri, mime, width, height, AVATAR_FULL_MAX_DIMENSION)
  const scale = AVATAR_FULL_MAX_DIMENSION / Math.max(width, height)
  const fullW = Math.max(1, Math.round(width * scale))
  const fullH = Math.max(1, Math.round(height * scale))
  const thumb = await maybeResize(full.uri, full.mime, fullW, fullH, AVATAR_THUMB_MAX_DIMENSION)
  return { fullUri: full.uri, fullMime: full.mime, thumbUri: thumb.uri, thumbMime: thumb.mime }
}

async function localFileUri(uri: string): Promise<string> {
  if (uri.startsWith('file://')) return uri
  const dest = `${cacheDirectory}upload-${Date.now()}.tmp`
  await copyAsync({ from: uri, to: dest })
  return dest
}

export async function readImageBytes(uri: string): Promise<ArrayBuffer> {
  const local = await localFileUri(uri)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const buffer = await Promise.race([
      new ExpoFile(local).arrayBuffer(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Reading that image timed out. Try another photo.')), READ_TIMEOUT_MS)
      }),
    ])
    if (buffer.byteLength === 0) throw new Error('Could not read that image. Try another photo.')
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error('That image is too large. Please choose a smaller photo.')
    }
    return buffer
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function uploadImageBytes(
  bucket: string,
  path: string,
  uri: string,
  mime: string,
): Promise<void> {
  if (!ALLOWED_BUCKETS.has(bucket)) throw new Error('Invalid upload destination.')
  assertStoragePath(path)
  assertAllowedMime(mime)
  const supabase = requireSupabase()
  const body = await readImageBytes(uri)
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw error
}

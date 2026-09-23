import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { File as ExpoFile } from 'expo-file-system'
import { cacheDirectory, copyAsync } from 'expo-file-system/legacy'
import { requireSupabase } from './supabase'

/** Longest edge for avatar uploads; they render at <=80 px, so 256 is ample. */
export const AVATAR_MAX_DIMENSION = 256

function newId(): string {
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  )
}

export function extFor(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/jpeg') return 'jpg'
  return 'webp'
}

export function storagePath(prefix: string, ext: string): string {
  return prefix + '/' + newId() + '.' + ext
}

export async function maybeResize(
  uri: string,
  mime: string,
  width: number,
  height: number,
  maxDimension: number,
): Promise<{ uri: string; mime: string }> {
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

async function localFileUri(uri: string): Promise<string> {
  if (uri.startsWith('file://')) return uri
  const dest = `${cacheDirectory}upload-${Date.now()}.tmp`
  await copyAsync({ from: uri, to: dest })
  return dest
}

export async function readImageBytes(uri: string): Promise<ArrayBuffer> {
  const local = await localFileUri(uri)
  const buffer = await new ExpoFile(local).arrayBuffer()
  if (buffer.byteLength === 0) throw new Error('Could not read that image. Try another photo.')
  return buffer
}

export async function uploadImageBytes(
  bucket: string,
  path: string,
  uri: string,
  mime: string,
): Promise<void> {
  const supabase = requireSupabase()
  const body = await readImageBytes(uri)
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: mime,
  })
  if (error) throw error
}

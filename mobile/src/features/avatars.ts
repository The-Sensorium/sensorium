import { useQuery } from '@tanstack/react-query'
import { requireSupabase } from '../lib/supabase'
import { extFor, newStorageId, prepareAvatarPair, uploadImageBytes } from '../lib/upload-image'

const AVATAR_TTL_SECONDS = 3600
const AVATAR_STALE_MS = AVATAR_TTL_SECONDS * 1000 - 60_000

const AVATAR_PATH_RE = /^(?:[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+\.[a-z0-9]+$/

function sanitizeAvatarPath(raw: string | null): string | null {
  if (!raw) return null
  if (raw.includes('..') || raw.includes('://')) return null
  if (raw.split('/').length > 2) return null
  if (!AVATAR_PATH_RE.test(raw)) return null
  return raw
}

export function avatarStoragePath(stored: string | null | undefined): string | null {
  if (!stored) return null
  const marker = '/avatars/'
  const idx = stored.indexOf(marker)
  if (idx !== -1) {
    const raw = stored.slice(idx + marker.length).split('?')[0].split('#')[0]
    try {
      return sanitizeAvatarPath(decodeURIComponent(raw))
    } catch {
      return sanitizeAvatarPath(raw)
    }
  }
  return sanitizeAvatarPath(stored)
}

export function avatarFullFor(stored: string | null | undefined): string | null {
  const path = avatarStoragePath(stored)
  if (!path) return null
  if (path.match(/^(.*)_full\.([a-z0-9]+)$/)) return path
  const thumb = path.match(/^(.*)_thumb\.([a-z0-9]+)$/)
  if (thumb) return `${thumb[1]}_full.${thumb[2]}`
  return null
}

export async function deleteAvatarObject(stored: string | null | undefined): Promise<void> {
  const path = avatarStoragePath(stored)
  if (!path) return
  const supabase = requireSupabase()
  const { error } = await supabase.storage.from('avatars').remove([path])
  if (error) throw error
}

export async function deleteAvatarObjects(
  full: string | null | undefined,
  thumb: string | null | undefined,
): Promise<void> {
  const paths = [...new Set([avatarStoragePath(full), avatarStoragePath(thumb)])].filter(
    (p): p is string => p !== null,
  )
  if (paths.length === 0) return
  const supabase = requireSupabase()
  const { error } = await supabase.storage.from('avatars').remove(paths)
  if (error) throw error
}

/** Resize, validate, and upload an avatar pair; returns both storage paths. */
export async function uploadAvatar(
  userId: string,
  uri: string,
  mime: string,
  width: number,
  height: number,
): Promise<{ fullPath: string; thumbPath: string }> {
  const pair = await prepareAvatarPair(uri, mime, width, height)
  const safeUser = /^[A-Za-z0-9_-]+$/.test(userId) ? userId : 'me'
  const id = newStorageId()
  const fullPath = `${safeUser}/${id}_full.${extFor(pair.fullMime)}`
  const sameFile = pair.fullUri === pair.thumbUri && pair.fullMime === pair.thumbMime
  const thumbPath = sameFile ? fullPath : `${safeUser}/${id}_thumb.${extFor(pair.thumbMime)}`
  await uploadImageBytes('avatars', fullPath, pair.fullUri, pair.fullMime)
  if (!sameFile) {
    try {
      await uploadImageBytes('avatars', thumbPath, pair.thumbUri, pair.thumbMime)
    } catch (err) {
      await requireSupabase().storage.from('avatars').remove([fullPath]).catch(() => {})
      throw err
    }
  }
  return { fullPath, thumbPath }
}

function useAvatarPath(stored: string | null | undefined, fallback: string | null | undefined, opts?: { enabled?: boolean }) {
  const path = avatarStoragePath(stored) ?? avatarStoragePath(fallback)
  return useQuery({
    queryKey: ['avatar-url', path ?? 'none'],
    enabled: path !== null && (opts?.enabled ?? true),
    queryFn: async () => {
      if (!path) return null
      const supabase = requireSupabase()
      const { data, error } = await supabase.storage
        .from('avatars')
        .createSignedUrl(path, AVATAR_TTL_SECONDS)
      if (error) throw error
      if (!data?.signedUrl) throw new Error('No signed URL')
      return data.signedUrl
    },
    staleTime: AVATAR_STALE_MS,
    gcTime: AVATAR_TTL_SECONDS * 1000,
    refetchInterval: AVATAR_STALE_MS,
    refetchIntervalInBackground: false,
  })
}

export function useAvatarUrl(stored: string | null | undefined) {
  return useAvatarPath(stored, null)
}

export function useAvatarThumbUrl(
  thumb: string | null | undefined,
  full?: string | null | undefined,
) {
  return useAvatarPath(thumb, full ?? null)
}

export function useAvatarFullUrl(
  full: string | null | undefined,
  thumb?: string | null | undefined,
  opts?: { enabled?: boolean },
) {
  return useAvatarPath(full, thumb ?? null, opts)
}

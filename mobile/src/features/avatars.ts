import { useQuery } from '@tanstack/react-query'
import { requireSupabase } from '../lib/supabase'
import { AVATAR_MAX_DIMENSION, extFor, maybeResize, storagePath, uploadImageBytes } from '../lib/upload-image'

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

export async function deleteAvatarObject(stored: string | null | undefined): Promise<void> {
  const path = avatarStoragePath(stored)
  if (!path) return
  const supabase = requireSupabase()
  const { error } = await supabase.storage.from('avatars').remove([path])
  if (error) throw error
}

/** Resize, validate, and upload an avatar; returns the storage path. */
export async function uploadAvatar(
  userId: string,
  uri: string,
  mime: string,
  width: number,
  height: number,
): Promise<string> {
  const final = await maybeResize(uri, mime, width, height, AVATAR_MAX_DIMENSION)
  const path = storagePath(userId, extFor(final.mime))
  await uploadImageBytes('avatars', path, final.uri, final.mime)
  return path
}

export function useAvatarUrl(stored: string | null | undefined) {
  const path = avatarStoragePath(stored)
  return useQuery({
    queryKey: ['avatar-url', path ?? 'none'],
    enabled: path !== null,
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

import { useQuery } from '@tanstack/react-query'
import { requireSupabase } from '../lib/supabase'

const AVATAR_TTL_SECONDS = 3600
const AVATAR_STALE_MS = AVATAR_TTL_SECONDS * 1000 - 60_000 // refresh a minute before expiry

const AVATAR_PATH_RE = /^(?:[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+\.[a-z0-9]+$/

function sanitizeAvatarPath(raw: string | null): string | null {
  if (!raw) return null
  if (raw.includes('..') || raw.includes('://')) return null
  if (raw.split('/').length > 2) return null
  if (!AVATAR_PATH_RE.test(raw)) return null
  return raw
}

/** Extract the storage path from a stored avatar value (full URL or bare path). */
export function avatarStoragePath(stored: string | null | undefined): string | null {
  if (!stored) return null
  const marker = '/avatars/'
  const idx = stored.indexOf(marker)
  if (idx !== -1) {
    // Signed URLs encode the folder separator and carry a token query; recover
    // the real storage path (used verbatim by createSignedUrl) from them.
    const raw = stored.slice(idx + marker.length).split('?')[0].split('#')[0]
    try {
      return sanitizeAvatarPath(decodeURIComponent(raw))
    } catch {
      return sanitizeAvatarPath(raw)
    }
  }
  return sanitizeAvatarPath(stored)
}

/** Delete an avatar object (owner scoped by the 0050 storage policy). */
export async function deleteAvatarObject(stored: string | null | undefined): Promise<void> {
  const path = avatarStoragePath(stored)
  if (!path) return
  const supabase = requireSupabase()
  const { error } = await supabase.storage.from('avatars').remove([path])
  if (error) throw error
}

/** A short-lived signed URL for an avatar, refreshed before it expires. */
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

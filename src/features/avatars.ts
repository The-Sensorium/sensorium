import { useQuery } from '@tanstack/react-query'
import { requireSupabase } from '../lib/supabase'

const AVATAR_TTL_SECONDS = 86400
const AVATAR_STALE_MS = AVATAR_TTL_SECONDS * 1000 - 60_000 // refresh a minute before expiry

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
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return stored
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
    refetchInterval: AVATAR_STALE_MS,
  })
}

import { useQuery } from '@tanstack/react-query'
import { requireSupabase } from '../lib/supabase'

const AVATAR_TTL_SECONDS = 86400
const AVATAR_STALE_MS = AVATAR_TTL_SECONDS * 1000 - 60_000

export function avatarStoragePath(stored: string | null | undefined): string | null {
  if (!stored) return null
  const marker = '/avatars/'
  const idx = stored.indexOf(marker)
  if (idx !== -1) {
    const raw = stored.slice(idx + marker.length).split('?')[0].split('#')[0]
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return stored
}

export async function deleteAvatarObject(stored: string | null | undefined): Promise<void> {
  const path = avatarStoragePath(stored)
  if (!path) return
  const supabase = requireSupabase()
  const { error } = await supabase.storage.from('avatars').remove([path])
  if (error) throw error
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
    refetchInterval: AVATAR_STALE_MS,
  })
}

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

/**
 * Derive the full path from a thumb path. Returns null when the input is
 * not a variant path.
 */
export function avatarFullFor(stored: string | null | undefined): string | null {
  const path = avatarStoragePath(stored)
  if (!path) return null
  if (path.match(/^(.*)_full\.([a-z0-9]+)$/)) return path
  const thumb = path.match(/^(.*)_thumb\.([a-z0-9]+)$/)
  if (thumb) return `${thumb[1]}_full.${thumb[2]}`
  return null
}

/** Delete one avatar object (owner scoped by the 0050 storage policy). */
export async function deleteAvatarObject(stored: string | null | undefined): Promise<void> {
  const path = avatarStoragePath(stored)
  if (!path) return
  const supabase = requireSupabase()
  const { error } = await supabase.storage.from('avatars').remove([path])
  if (error) throw error
}

/**
 * Delete an avatar pair (full + thumb). Tolerates one side missing so legacy
 * single-file rows and GIF rows (same path twice) clean up safely.
 */
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

function newAvatarId(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.()
    if (uuid) return uuid
  } catch {
    // fall through to timestamp fallback
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Upload a prepared full + thumb pair; returns both storage paths.
 * Callers persist both columns, then delete the superseded pair.
 */
export async function uploadAvatarPair(
  userId: string,
  full: File,
  thumb: File,
): Promise<{ fullPath: string; thumbPath: string }> {
  const supabase = requireSupabase()
  const safeUser = /^[A-Za-z0-9_-]+$/.test(userId) ? userId : 'me'
  const id = newAvatarId()
  const fullExt = (full.name.split('.').pop()?.toLowerCase() || 'webp').replace(/[^a-z0-9]/g, '') || 'webp'
  const thumbExt = (thumb.name.split('.').pop()?.toLowerCase() || 'webp').replace(/[^a-z0-9]/g, '') || 'webp'
  const fullPath = `${safeUser}/${id}_full.${fullExt}`
  const sameFile = full === thumb || (full.size === thumb.size && full.type === thumb.type && full.name === thumb.name)
  const thumbPath = sameFile ? fullPath : `${safeUser}/${id}_thumb.${thumbExt}`

  const { error: fullError } = await supabase.storage.from('avatars').upload(fullPath, full, {
    cacheControl: '31536000',
    upsert: false,
    contentType: full.type,
  })
  if (fullError) throw fullError
  if (sameFile) return { fullPath, thumbPath: fullPath }

  const { error: thumbError } = await supabase.storage.from('avatars').upload(thumbPath, thumb, {
    cacheControl: '31536000',
    upsert: false,
    contentType: thumb.type,
  })
  if (thumbError) {
    // Best-effort orphan cleanup; the upload already failed, so a failed
    // cleanup must not mask the original error.
    await supabase.storage.from('avatars').remove([fullPath])
    throw thumbError
  }
  return { fullPath, thumbPath }
}

function useAvatarPath(
  stored: string | null | undefined,
  thumbFallback: string | null | undefined,
  opts?: { enabled?: boolean },
) {
  const path = avatarStoragePath(stored) ?? avatarStoragePath(thumbFallback)
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

/** A short-lived signed URL for an avatar, refreshed before it expires. */
export function useAvatarUrl(stored: string | null | undefined) {
  return useAvatarPath(stored, null)
}

/** List thumbnail URL: prefers the 256px thumb, falls back to the full file. */
export function useAvatarThumbUrl(
  thumb: string | null | undefined,
  full?: string | null | undefined,
) {
  return useAvatarPath(thumb, full ?? null)
}

/** Fullscreen viewer URL: prefers the 1024px full file, falls back to thumb. */
export function useAvatarFullUrl(
  full: string | null | undefined,
  thumb?: string | null | undefined,
  opts?: { enabled?: boolean },
) {
  return useAvatarPath(full, thumb ?? null, opts)
}

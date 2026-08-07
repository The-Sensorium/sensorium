import { useQuery } from '@tanstack/react-query'

const KLIPY_APP_KEY = import.meta.env.VITE_KLIPY_APP_KEY as string | undefined
const KLIPY_ENDPOINT =
  (import.meta.env.VITE_KLIPY_ENDPOINT as string | undefined) ?? 'https://api.klipy.com/api/v1'

export const gifSearchEnabled = Boolean(KLIPY_APP_KEY)

export interface Gif {
  id: string
  title: string
  /** The animated GIF source embedded into the message. */
  url: string
  /** A small animated preview for the picker grid. */
  thumb: string
  width: number
  height: number
}

interface KlipyMedia {
  url?: string
  width?: number
  height?: number
}

interface KlipyGif {
  id?: number | string
  slug?: string
  title?: string
  file?: {
    md?: { gif?: KlipyMedia; webp?: KlipyMedia }
    sm?: { gif?: KlipyMedia; webp?: KlipyMedia }
    hd?: { gif?: KlipyMedia }
  }
}

/** Extract the fields the room needs from a Klipy API payload. Pure + testable. */
export function parseKlipyResults(payload: unknown): Gif[] {
  if (!payload || typeof payload !== 'object') return []
  const root = (payload as { data?: unknown }).data
  // Klipy returns { data: { data: [...] } }; accept a top-level array too.
  const items = Array.isArray(root) ? root : (root as { data?: unknown } | undefined)?.data
  if (!Array.isArray(items)) return []
  return items
    .map((raw): Gif | null => {
      const g = raw as KlipyGif
      const url = g.file?.md?.gif?.url ?? g.file?.hd?.gif?.url ?? g.file?.sm?.gif?.url
      const thumb = g.file?.sm?.webp?.url ?? g.file?.sm?.gif?.url ?? url
      if (!url || !thumb) return null
      const width = g.file?.md?.gif?.width ?? g.file?.sm?.gif?.width ?? 480
      const height = g.file?.md?.gif?.height ?? g.file?.sm?.gif?.height ?? 480
      return {
        id: g.slug ?? String(g.id),
        title: g.title ?? '',
        url,
        thumb,
        width,
        height,
      }
    })
    .filter((g): g is Gif => g !== null)
}

async function fetchKlipy(kind: 'search' | 'trending', query: string): Promise<Gif[]> {
  const url = new URL(`${KLIPY_ENDPOINT}/${KLIPY_APP_KEY}/gifs/${kind}`)
  url.searchParams.set('per_page', '24')
  url.searchParams.set('content_filter', 'low')
  if (query) url.searchParams.set('q', query)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('GIF search failed')
  return parseKlipyResults(await res.json())
}

/** Trending GIFs, shown in the picker before the user has typed a query. */
export function useTrendingGifs(enabled = true) {
  return useQuery({
    queryKey: ['gifs', 'trending'],
    enabled: enabled && gifSearchEnabled,
    staleTime: 5 * 60_000,
    queryFn: () => fetchKlipy('trending', ''),
  })
}

/** Search GIFs; disabled until the query has a real term and a key is set. */
export function useSearchGifs(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['gifs', 'search', trimmed.toLowerCase()],
    enabled: trimmed.length > 0 && gifSearchEnabled,
    staleTime: 5 * 60_000,
    queryFn: () => fetchKlipy('search', trimmed),
  })
}
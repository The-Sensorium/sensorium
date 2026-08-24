import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
  useSearchGifs,
  useTrendingGifs,
  gifSearchEnabled,
  type Gif,
} from '../../../features/gifs'

export function GifPicker({
  pending,
  onSelect,
}: {
  pending: boolean
  onSelect(gif: Gif): void
}) {
  const [query, setQuery] = useState('')
  const search = useSearchGifs(query)
  const trending = useTrendingGifs(true)
  const gifs = query.trim() ? search.data : trending.data

  const loading = query.trim() ? search.isPending : trending.isPending
  const error = query.trim() ? search.error : trending.error

  return (
    <div
      className="absolute bottom-full left-0 z-30 mb-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-2xl border border-outline-variant/60 bg-surface p-2 shadow-lift"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="search"
        aria-label="Search GIFs"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        placeholder="Search KLIPY…"
        disabled={!gifSearchEnabled}
        className="min-w-0 rounded-xl border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/60 focus:border-primary"
      />
      {!gifSearchEnabled ? (
        <p className="px-1 py-3 text-center text-xs text-on-surface-variant">
          GIF search is not configured. Set VITE_KLIPY_APP_KEY to enable it.
        </p>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : error ? (
        <p className="px-1 py-3 text-center text-sm text-error">Could not load GIFs.</p>
      ) : !gifs || gifs.length === 0 ? (
        <p className="px-1 py-3 text-center text-sm text-on-surface-variant">
          {query.trim() ? 'No GIFs found.' : 'No trending GIFs available.'}
        </p>
      ) : (
        <>
          <ul className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto" aria-label="GIF results">
            {gifs.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  aria-label={`Send ${g.title || 'GIF'}`}
                  disabled={pending}
                  onClick={() => onSelect(g)}
                  className={cn(
                    'block w-full overflow-hidden rounded-xl bg-surface-container transition-transform',
                    pending ? 'cursor-wait opacity-70' : 'hover:scale-[1.02]',
                  )}
                >
                  <img
                    src={g.thumb}
                    alt={g.title || 'GIF'}
                    loading="lazy"
                    className="aspect-video h-auto w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
          <p className="px-1 text-center text-[10px] text-on-surface-variant/60">
            Powered by KLIPY
          </p>
        </>
      )}
    </div>
  )
}
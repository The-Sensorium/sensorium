import { useEffect, useRef, useState } from 'react'
import { ImagePlay, ImagePlus, Loader2, Send, X } from 'lucide-react'
import { GifPicker } from '../pages/cluster/room/GifPicker'
import { useCreatePost, uploadPostImage, POST_CONTENT_MAX, POST_TITLE_MAX } from '../features/posts'
import type { Gif } from '../features/gifs'
import { toErrorMessage } from '../lib/error'
import { cn } from '../lib/utils'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function PostComposer({
  clusterId,
  onPosted,
}: {
  clusterId: string
  onPosted?: () => void
}) {
  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [gif, setGif] = useState<Gif | null>(null)
  const [gifOpen, setGifOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const create = useCreatePost(clusterId)

  useEffect(() => {
    function dismiss() {
      setGifOpen(false)
    }
    document.addEventListener('click', dismiss)
    return () => document.removeEventListener('click', dismiss)
  }, [])

  function handleFile(f?: File) {
    if (!f) return
    setError(null)
    if (!ALLOWED_IMAGE_TYPES.has(f.type)) {
      setError('Only JPG, PNG, WebP and GIF images are supported.')
      return
    }
    if (f.size > MAX_IMAGE_BYTES) {
      setError('Images must be 5 MB or smaller.')
      return
    }
    setGif(null)
    setFile(f)
  }

  async function handlePost() {
    const content = draft.trim()
    const t = title.trim() || null
    if ((!content && !file && !gif) || create.isPending) return
    setError(null)
    try {
      if (gif) {
        await create.mutateAsync({ content: content || null, gifUrl: gif.url, title: t })
      } else if (file) {
        const path = await uploadPostImage(clusterId, file)
        await create.mutateAsync({ content: content || null, imageUrl: path, title: t })
      } else {
        await create.mutateAsync({ content: content || null, title: t })
      }
      setDraft('')
      setTitle('')
      setFile(null)
      setGif(null)
      onPosted?.()
    } catch (e) {
      setError(toErrorMessage(e, 'Could not post. Try again.'))
    }
  }

  const hasContent = Boolean(draft.trim() || file || gif)

  return (
    <form
      className="rounded-2xl border border-outline-variant/60 bg-surface p-4 shadow-soft"
      onSubmit={(e) => {
        e.preventDefault()
        void handlePost()
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={POST_TITLE_MAX}
        placeholder="Post title (optional)"
        aria-label="Post title"
        className="w-full rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-2.5 text-sm font-semibold text-on-surface outline-none transition-colors placeholder:font-normal placeholder:text-on-surface-variant/60 focus:border-primary"
      />
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        maxLength={POST_CONTENT_MAX}
        placeholder="Share something with your cluster…"
        aria-label="New post"
        className="mt-2 w-full resize-none rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-sm leading-6 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary"
      />
      {(file || gif) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-on-surface-variant">
          {file ? (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-container px-3 py-1">
              <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> {file.name}
            </span>
          ) : gif ? (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-container px-3 py-1">
              <ImagePlay className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> {gif.title || 'GIF'}
            </span>
          ) : null}
          <button
            type="button"
            aria-label="Remove media"
            onClick={() => {
              setFile(null)
              setGif(null)
            }}
            className="grid h-5 w-5 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Attach image"
            onClick={() => fileRef.current?.click()}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-sm font-semibold transition-colors',
              file
                ? 'bg-primary-container/15 text-primary hover:bg-primary-container/25'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
            )}
          >
            <ImagePlus className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Image
          </button>
          <button
            type="button"
            aria-label="Add a GIF"
            aria-haspopup="dialog"
            aria-expanded={gifOpen}
            onClick={(e) => {
              e.stopPropagation()
              setGifOpen((o) => !o)
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-sm font-semibold transition-colors',
              gif
                ? 'bg-primary-container/15 text-primary hover:bg-primary-container/25'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
            )}
          >
            <ImagePlay className="h-4 w-4" strokeWidth={1.5} aria-hidden /> GIF
          </button>
          {gifOpen && (
            <GifPicker
              placement="bottom"
              pending={create.isPending}
              onSelect={(g) => {
                setGif(g)
                setFile(null)
                setGifOpen(false)
              }}
            />
          )}
        </div>
        <button
          type="submit"
          disabled={!hasContent || create.isPending}
          className="ml-auto inline-flex items-center gap-2 rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          )}
          {create.isPending ? 'Posting...' : 'Post'}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </form>
  )
}

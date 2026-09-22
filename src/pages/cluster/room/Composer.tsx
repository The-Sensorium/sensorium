import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import { CornerUpLeft, ImagePlay, ImagePlus, Loader2, Megaphone, Phone, Plus, Send, Users, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Avatar } from '../../../components/Avatar'
import {
  EVERYONE_NAME,
  filterMentionCandidates,
  matchesEveryone,
  parseMentionQuery,
  type MentionMember,
} from '../../../features/mentions'
import { type Gif } from '../../../features/gifs'
import { rateLimitMessage } from '../../../lib/error'
import { GifPicker } from './GifPicker'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function Composer({
  members,
  selfId,
  pending,
  raisePending,
  error,
  replyTo,
  onError,
  onTyping,
  onStopTyping,
  onSend,
  onSendImage,
  onSendGif,
  onOpenSignal,
  onStartCall,
  callActive,
  onCancelReply,
}: {
  members: MentionMember[]
  selfId: string | null
  pending: boolean
  raisePending: boolean
  error: string | null
  replyTo: { id: string; authorName: string; preview: string } | null
  onError(message: string | null): void
  onTyping(): void
  onStopTyping(): void
  onSend(content: string): Promise<void>
  onSendImage(file: File): Promise<void>
  onSendGif(gif: Gif): Promise<void>
  onOpenSignal(): void
  onStartCall(): void
  callActive: boolean
  onCancelReply(): void
}) {
  const [draft, setDraft] = useState('')
  const [gifOpen, setGifOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingTimer = useRef<number | null>(null)

  const mentionMembers = useMemo(() => {
    if (!selfId) return []
    return members.filter((m) => m.id !== selfId)
  }, [members, selfId])

  const showEveryone = mention !== null && matchesEveryone(mention.query)
  const mentionCandidates = useMemo(() => {
    if (!mention || mentionMembers.length === 0) return []
    return filterMentionCandidates(mention.query, mentionMembers, selfId ?? '').slice(
      0,
      showEveryone ? 7 : 8,
    )
  }, [mention, mentionMembers, selfId, showEveryone])
  const mentionTotal = (showEveryone ? 1 : 0) + mentionCandidates.length

  useEffect(() => {
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current)
    }
  }, [])

  // Close the room-actions popover on outside click / Escape.
  useEffect(() => {
    function dismiss() {
      setComposerOpen(false)
      setGifOpen(false)
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('click', dismiss)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', dismiss)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  function handleInputChange(value: string) {
    setDraft(value)
    const caret = inputRef.current?.selectionStart ?? value.length
    setMention(parseMentionQuery(value, caret))
    setMentionIndex(0)
    onTyping()
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(() => onStopTyping(), 2000)
  }

  function insertToken(name: string) {
    if (!mention) return
    const next = `${draft.slice(0, mention.start)}@${name} ${draft.slice(mention.end)}`
    setDraft(next)
    setMention(null)
    setMentionIndex(0)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        const pos = mention.start + 1 + name.length + 1
        el.setSelectionRange(pos, pos)
        el.focus()
      }
    })
  }

  function insertMention(member: MentionMember) {
    insertToken(member.display_name)
  }

  function insertEveryone() {
    insertToken(EVERYONE_NAME)
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && mentionTotal > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % mentionTotal)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => (i - 1 + mentionTotal) % mentionTotal)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (showEveryone && mentionIndex === 0) insertEveryone()
        else {
          const candidate = mentionCandidates[mentionIndex - (showEveryone ? 1 : 0)]
          if (candidate) insertMention(candidate)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setMention(null)
      }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  async function handleSend() {
    const content = draft.trim()
    if (!content || pending || uploading) return
    onError(null)
    onStopTyping()
    try {
      await onSend(content)
      setDraft('')
    } catch (e) {
      onError(rateLimitMessage(e, 'Could not send your message. Try again.'))
    }
  }

  async function handleSendGif(gif: Gif) {
    onError(null)
    onStopTyping()
    setGifOpen(false)
    try {
      await onSendGif(gif)
    } catch (e) {
      onError(rateLimitMessage(e, 'Could not send that GIF. Try again.'))
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    onError(null)
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      onError('Only JPG, PNG, WebP and GIF images are supported.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      onError('Images must be 5 MB or smaller.')
      return
    }
    setUploading(true)
    onStopTyping()
    try {
      await onSendImage(file)
    } catch (e) {
      onError(rateLimitMessage(e, 'Could not send that image. Try again.'))
    } finally {
      setUploading(false)
    }
  }

  const actionsButton =
    'grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60'
  const sendButton =
    'grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full bg-surface-container transition-colors disabled:opacity-60'

  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <form
        className="relative flex shrink-0 items-end gap-2 border-t border-outline-variant/60 bg-background py-3"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSend()
        }}
      >
        {replyTo && (
          <div className="absolute inset-x-0 bottom-full mb-2 flex items-center gap-2 rounded-2xl border border-outline-variant/60 bg-surface px-3 py-2 shadow-soft">
            <span aria-hidden>
              <CornerUpLeft className="h-4 w-4 text-on-surface-variant" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1 text-xs leading-tight">
              <span className="font-semibold text-on-surface">Replying to {replyTo.authorName}</span>
              <span className="block truncate text-on-surface-variant">{replyTo.preview}</span>
            </div>
            <button
              type="button"
              aria-label="Cancel reply"
              onClick={onCancelReply}
              className="grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container sm:h-8 sm:w-8 sm:min-h-[32px] sm:min-w-[32px]"
            >
              <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        )}
        {gifOpen && (
          <GifPicker pending={pending} onSelect={(gif) => void handleSendGif(gif)} />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Room actions"
            aria-haspopup="menu"
            aria-expanded={composerOpen}
            aria-controls={composerOpen ? 'room-actions-menu' : undefined}
            disabled={raisePending}
            onClick={(e) => {
              e.stopPropagation()
              setComposerOpen((open) => !open)
            }}
            className={actionsButton}
          >
            <Plus
              className={cn('h-5 w-5 transition-transform', composerOpen && 'rotate-45')}
              strokeWidth={1.5}
              aria-hidden
            />
          </button>
          {composerOpen && (
            <div
              id="room-actions-menu"
              role="menu"
              aria-label="Room actions"
              className="absolute bottom-full left-0 z-20 mb-2 flex w-max flex-col gap-1 rounded-2xl border border-outline-variant/60 bg-surface p-2 shadow-soft"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                disabled={uploading}
                onClick={() => {
                  setComposerOpen(false)
                  fileRef.current?.click()
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2.5 sm:min-h-0 sm:py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
              >
                <ImagePlus className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Send an image
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={uploading}
                onClick={() => {
                  setComposerOpen(false)
                  setGifOpen(true)
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2.5 sm:min-h-0 sm:py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
              >
                <ImagePlay className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Send a GIF
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={raisePending}
                onClick={() => {
                  setComposerOpen(false)
                  onOpenSignal()
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2.5 sm:min-h-0 sm:py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container hover:text-tertiary disabled:opacity-60"
              >
                <Megaphone className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Raise a signal
              </button>
              {!callActive && (
                <button
                  type="button"
                  role="menuitem"
                  data-e2e="start-call"
                  disabled={raisePending}
                  onClick={() => {
                    setComposerOpen(false)
                    onStartCall()
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2.5 sm:min-h-0 sm:py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
                >
                  <Phone className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Start a call
                </button>
              )}
            </div>
          )}
        </div>
        <label htmlFor="room-input" className="sr-only">
          Message
        </label>
        <div className="relative min-w-0 flex-1">
          {mention && mentionTotal > 0 && (
            <div
              id="mention-listbox"
              role="listbox"
              aria-label="Mention a member"
              className="absolute bottom-full left-0 z-20 mb-2 w-max min-w-44 max-w-full overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface p-2 shadow-soft"
            >
              {showEveryone && (
                <button
                  key="everyone"
                  id="mention-option-0"
                  type="button"
                  role="option"
                  aria-selected={mentionIndex === 0}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertEveryone()}
                  className={cn(
                    'flex min-h-[44px] w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm text-on-surface transition-colors sm:min-h-0 sm:py-2',
                    mentionIndex === 0 ? 'bg-surface-container' : 'hover:bg-surface-container/60',
                  )}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-container/25 text-primary" aria-hidden>
                    <Users className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                  <span className="truncate">everyone</span>
                </button>
              )}
              {mentionCandidates.map((candidate, i) => {
                const index = i + (showEveryone ? 1 : 0)
                return (
                  <button
                    key={candidate.id}
                    id={`mention-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === mentionIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMention(candidate)}
                    className={cn(
                      'flex min-h-[44px] w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm text-on-surface transition-colors sm:min-h-0 sm:py-2',
                      index === mentionIndex ? 'bg-surface-container' : 'hover:bg-surface-container/60',
                    )}
                  >
                    <Avatar
                      name={candidate.display_name}
                      src={candidate.avatar_url}
                      className="h-6 w-6"
                      textClassName="text-xs"
                    />
                    <span className="truncate">{candidate.display_name}</span>
                  </button>
                )
              })}
            </div>
          )}
          {/* 16px on phones stops iOS auto-zooming the page on focus - that zoom
              sticks after the keyboard closes and strands a gap below the composer. */}
          <TextareaAutosize
            ref={inputRef}
            id="room-input"
            role="combobox"
            minRows={1}
            maxRows={5}
            aria-expanded={mention !== null && mentionTotal > 0}
            aria-controls="mention-listbox"
            aria-autocomplete="list"
            aria-activedescendant={
              mention && mentionTotal > 0 ? `mention-option-${mentionIndex}` : undefined
            }
            value={draft}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={() => {
              onStopTyping()
              setMention(null)
              // Drop any page offset iOS stranded while the keyboard was open
              // so no gap lingers below the composer after it closes.
              requestAnimationFrame(() => window.scrollTo(0, 0))
            }}
            placeholder="Write to your cluster…"
            maxLength={2000}
            className="min-w-0 w-full flex-1 resize-none overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-2.5 text-base leading-6 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary sm:text-sm sm:leading-5"
          />
        </div>
        <button
          type="submit"
          disabled={!draft.trim() || pending || uploading}
          aria-label="Send message"
          className={cn(
            sendButton,
            draft.trim() ? 'text-primary' : 'text-on-surface-variant',
          )}
        >
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <Send className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          )}
        </button>
      </form>
    </>
  )
}
import TextareaAutosize from 'react-textarea-autosize'
import { useLayoutEffect, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useDocumentTitle } from '../../lib/use-document-title'
import { CLUSTER_SIZE } from '../../lib/constants'
import {
  ArrowDown,
  ImagePlus,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Scale,
  Send,
  ShieldOff,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../app/auth-context'
import { useClusterMembers } from '../../features/matching'
import {
  filterMentionCandidates,
  parseMentionQuery,
  parseMentions,
  type MentionMember,
} from '../../features/mentions'
import {
  CHAT_PAGE_SIZE,
  useChatImageUrl,
  useClusterMessages,
  useClusterReactions,
  useDeleteMessage,
  useEditMessage,
  useLoadEarlierMessages,
  useSendMessage,
  useToggleReaction,
  uploadChatImage,
  type Message,
  type Reaction,
} from '../../features/cluster'
import {
  useClusterSignals,
  useSignalReplies,
  useRaiseSignal,
  type Signal,
  type SignalStatus,
} from '../../features/signals'
import { useClusterVotes, useReplacementRound, type Vote } from '../../features/votes'
import { useMarkClusterRead } from '../../features/notifications'
import { usePresence } from '../../features/realtime'
import { Avatar } from '../../components/Avatar'
import { CountdownTimer } from '../../components/CountdownTimer'
import { Modal } from '../../components/Modal'

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_SIGNAL_PROMPT = 300

const SIGNAL_STATUS: Record<SignalStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-primary/10 text-primary' },
  in_progress: { label: 'In progress', className: 'bg-tertiary-container/25 text-tertiary' },
  resolved: { label: 'Resolved', className: 'bg-surface-container text-on-surface-variant' },
}

const VOTE_TYPE_LABEL: Record<Vote['type'], string> = {
  replace_member: 'Replace a member',
  change_name: 'Rename the cluster',
  select_candidate: 'Choose a new member',
}

type TimelineItem =
  | { kind: 'message'; data: Message }
  | { kind: 'signal'; data: Signal }
  | { kind: 'vote'; data: Vote }

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <p className="my-3 text-center text-xs font-semibold uppercase tracking-wide text-on-surface-variant/70">
      {dayFormatter.format(new Date(iso))}
    </p>
  )
}

function MessageImage({ path, alt }: { path: string; alt: string }) {
  const { data: src, isError } = useChatImageUrl(path)
  if (isError || !src) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl bg-surface-container text-sm text-on-surface-variant">
        Image unavailable
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="max-h-72 w-full rounded-xl object-cover"
    />
  )
}

/** Renders message content, turning `@DisplayName` mentions into profile links. */
function MentionText({
  content,
  members,
  clusterId,
  own,
}: {
  content: string
  members: MentionMember[]
  clusterId: string
  own: boolean
}) {
  const parts = parseMentions(content, members)
  return (
    <span>
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <span key={i}>{part.value}</span>
        ) : (
          <span key={i}>
            {part.prefix}
            <Link
              to={`/profile/${part.id}?cluster=${clusterId}`}
              title={part.name}
              className={cn(
                'rounded px-1 py-0.5 font-semibold no-underline transition-colors',
                own
                  ? 'bg-on-primary/30 text-on-primary hover:bg-on-primary/45'
                  : 'bg-primary text-on-primary hover:opacity-90',
              )}
            >
              @{part.name}
            </Link>
          </span>
        ),
      )}
    </span>
  )
}

export function RoomView() {
  useDocumentTitle('Cluster Chat')
  const { clusterId = '' } = useParams()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const messages = useClusterMessages(clusterId)
  const loadedMessageIds = useMemo(() => (messages.data ?? []).map((m) => m.id), [messages.data])
  const reactions = useClusterReactions(clusterId, loadedMessageIds)
  const loadEarlier = useLoadEarlierMessages(clusterId)
  const queryClient = useQueryClient()
  const signals = useClusterSignals(clusterId)
  const signalReplies = useSignalReplies(clusterId, null)
  const votes = useClusterVotes(clusterId)
  const members = useClusterMembers(clusterId)
  const replacement = useReplacementRound(clusterId)
  const send = useSendMessage()
  const toggleReaction = useToggleReaction(clusterId)
  const editMessage = useEditMessage(clusterId)
  const deleteMessage = useDeleteMessage(clusterId)
  const raise = useRaiseSignal(clusterId)
  const markRead = useMarkClusterRead()
  const { typing, signalTyping, resetTyping } = usePresence(clusterId)

  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [signalOpen, setSignalOpen] = useState(false)
  const [signalPrompt, setSignalPrompt] = useState('')
  const [pinned, setPinned] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const exhaustedRef = useRef(false)
  const prevOldestIdRef = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<number | null>(null)
  const pinnedRef = useRef(true)
  const lastLenRef = useRef<number | null>(null)
  const anchorRef = useRef<{
    surface: 'container' | 'page'
    scrollTop: number
    scrollHeight: number
  } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  const memberMap = useMemo(() => {
    const map = new Map<string, { display_name: string; avatar_url: string | null }>()
    for (const m of members.data ?? []) {
      map.set(m.id, { display_name: m.display_name, avatar_url: m.avatar_url })
    }
    return map
  }, [members.data])

  // All members, used to render mention chips in the timeline (others can mention you).
  const parseMembers = useMemo<MentionMember[]>(() => {
    return (members.data ?? []).map((m) => ({
      id: m.id,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
    }))
  }, [members.data])

  // Members eligible for mention (mirrors the backend: the author is excluded).
  const mentionMembers = useMemo(() => {
    if (!userId) return []
    return parseMembers.filter((m) => m.id !== userId)
  }, [parseMembers, userId])

  const mentionCandidates = useMemo(() => {
    if (!mention || mentionMembers.length === 0) return []
    return filterMentionCandidates(mention.query, mentionMembers, userId ?? '')
  }, [mention, mentionMembers, userId])

  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, Reaction[]>()
    for (const r of reactions.data ?? []) {
      const list = map.get(r.message_id) ?? []
      list.push(r)
      map.set(r.message_id, list)
    }
    return map
  }, [reactions.data])

  const myReactionKeys = useMemo(() => {
    const set = new Set<string>()
    for (const r of reactions.data ?? []) {
      if (r.user_id === userId) set.add(`${r.message_id}:${r.emoji}`)
    }
    return set
  }, [reactions.data, userId])

  const replyCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of signalReplies.data ?? []) {
      map.set(r.signal_id, (map.get(r.signal_id) ?? 0) + 1)
    }
    return map
  }, [signalReplies.data])

  function scrollToEnd() {
    endRef.current?.scrollIntoView({ block: 'end' })
  }

  // Reset scroll/count state when switching clusters without unmounting.
  useEffect(() => {
    lastLenRef.current = null
    pinnedRef.current = true
    setPinned(true)
    setNewCount(0)
    exhaustedRef.current = false
    setHasMore(false)
    prevOldestIdRef.current = null
  }, [clusterId])

  // Auto-follow the newest message while the user is near the bottom. Once they
  // scroll up to read, stop following and count what arrives instead. The room
  // scrolls inside its timeline on desktop (lg+); on smaller screens the whole
  // page scrolls. Read whichever surface is actually scrollable.
  useEffect(() => {
    const container = scrollRef.current
    function onScroll() {
      const el = container
      const containerScrollable = el ? el.scrollHeight - el.clientHeight > 1 : false
      const distanceFromBottom =
        containerScrollable && el
          ? el.scrollHeight - el.scrollTop - el.clientHeight
          : document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      const nearBottom = distanceFromBottom < 96
      pinnedRef.current = nearBottom
      setPinned(nearBottom)
      if (nearBottom) setNewCount(0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    container?.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      container?.removeEventListener('scroll', onScroll)
    }
  }, [])

  useEffect(() => {
    const list = messages.data
    if (!list || list.length === 0) return
    const len = list.length
    const prev = lastLenRef.current
    lastLenRef.current = len
    if (prev === null) {
      scrollToEnd()
      return
    }
    if (len > prev) {
      if (pinnedRef.current) scrollToEnd()
      else setNewCount((count) => count + (len - prev))
    }
  }, [messages.data])

  // Offer "Load earlier" once the first page came back full (a full page means
  // there may be older rows). The ref keeps it hidden after history is drained.
  useEffect(() => {
    if (exhaustedRef.current) return
    if ((messages.data?.length ?? 0) >= CHAT_PAGE_SIZE) setHasMore(true)
  }, [messages.data])

  // Reactions are fetched for the loaded messages only. Refetch when the oldest
  // loaded message changes (initial load or an earlier page prepended), but not
  // when a new message is appended by the live channel — a fresh message can't
  // have reactions yet, so refetching for every incoming message is wasted work.
  useEffect(() => {
    const oldestId = loadedMessageIds[0] ?? null
    if (!oldestId) return
    if (prevOldestIdRef.current === oldestId) return
    prevOldestIdRef.current = oldestId
    void queryClient.invalidateQueries({ queryKey: ['cluster-reactions', clusterId] })
  }, [loadedMessageIds, clusterId, queryClient])

  useEffect(() => {
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current)
    }
  }, [])

  // Debounce: advance the room's read marker while the member is pinned to the
  // newest messages (on open, on scroll-to-bottom, and as messages stream in).
  // Clearing the timer on each new message collapses bursts into one write.
  const markReadTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!pinned || !clusterId) return
    if (markReadTimer.current) window.clearTimeout(markReadTimer.current)
    markReadTimer.current = window.setTimeout(() => markRead.mutate(clusterId), 400)
    return () => {
      if (markReadTimer.current) window.clearTimeout(markReadTimer.current)
    }
  }, [pinned, clusterId, messages.data, markRead])

  // Close the message action menu and reaction picker on outside click / Escape.
  useEffect(() => {
    function dismiss() {
      setMenuFor(null)
      setPickerFor(null)
      setComposerOpen(false)
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

  // Everything alive in the room on one timeline: messages, open signals, open votes.
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...(messages.data ?? [])
        .filter((m) => !m.deleted_at)
        .map((m) => ({ kind: 'message' as const, data: m })),
      ...(signals.data ?? [])
        .filter((s) => s.status !== 'resolved')
        .map((s) => ({ kind: 'signal' as const, data: s })),
      ...(votes.data ?? [])
        .filter((v) => v.status === 'open')
        .map((v) => ({ kind: 'vote' as const, data: v })),
    ]
    return items.sort((a, b) => a.data.created_at.localeCompare(b.data.created_at))
  }, [messages.data, signals.data, votes.data])

  function handleInputChange(value: string) {
    setDraft(value)
    const caret = inputRef.current?.selectionStart ?? value.length
    setMention(parseMentionQuery(value, caret))
    setMentionIndex(0)
    signalTyping()
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(() => resetTyping(), 2000)
  }

  function insertMention(member: MentionMember) {
    if (!mention) return
    const name = member.display_name
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

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % mentionCandidates.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionCandidates[mentionIndex])
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
    if (!content || !clusterId || send.isPending || uploading) return
    setError(null)
    resetTyping()
    try {
      await send.mutateAsync({ clusterId, content })
      setDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your message. Try again.')
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file || !clusterId) return
    setError(null)
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError('Only JPG, PNG, WebP and GIF images are supported.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Images must be 5 MB or smaller.')
      return
    }
    setUploading(true)
    resetTyping()
    try {
      const path = await uploadChatImage(clusterId, file)
      await send.mutateAsync({ clusterId, content: null, imageUrl: path })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that image. Try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    setError(null)
    try {
      await toggleReaction.mutateAsync({ messageId, emoji })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not react to that message.')
    }
  }

  function startEdit(m: { id: string; content: string | null }) {
    setMenuFor(null)
    setEditingId(m.id)
    setEditDraft(m.content ?? '')
  }

  async function saveEdit() {
    const content = editDraft.trim()
    if (!content || !editingId) return
    setError(null)
    try {
      await editMessage.mutateAsync({ messageId: editingId, content })
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not edit your message.')
    }
  }

  async function remove(messageId: string) {
    setMenuFor(null)
    setError(null)
    try {
      await deleteMessage.mutateAsync(messageId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete your message.')
    }
  }

  // Prepend an earlier page. The length watch treats this as a non-event so the
  // older messages don't count toward the "new messages" badge.
  async function handleLoadEarlier() {
    setError(null)
    // Record which surface is scrollable and its offset *before* the merge, so
    // we can re-anchor on the message the user is reading after content grows
    // above it (see useLayoutEffect below).
    const container = scrollRef.current
    if (container && container.scrollHeight - container.clientHeight > 1) {
      anchorRef.current = {
        surface: 'container',
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
      }
    } else {
      anchorRef.current = {
        surface: 'page',
        scrollTop: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
      }
    }
    try {
      const result = await loadEarlier.mutateAsync()
      lastLenRef.current = (messages.data?.length ?? 0) + result.added
      if (!result.hasMore) {
        exhaustedRef.current = true
        setHasMore(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load earlier messages.')
      anchorRef.current = null
    }
  }

  // After earlier messages are prepended, the timeline grows above the anchor
  // point. Bump the scroll offset by the added height so the message the user
  // was reading stays in place instead of jumping down into the new content.
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    anchorRef.current = null
    const delta =
      anchor.surface === 'container'
        ? (scrollRef.current?.scrollHeight ?? anchor.scrollHeight) - anchor.scrollHeight
        : document.documentElement.scrollHeight - anchor.scrollHeight
    if (anchor.surface === 'container') {
      const el = scrollRef.current
      if (el) el.scrollTop = anchor.scrollTop + delta
    } else if (delta !== 0) {
      window.scrollTo(0, anchor.scrollTop + delta)
    }
  }, [messages.data])

  async function handleRaise() {
    const prompt = signalPrompt.trim()
    if (!prompt) return
    setError(null)
    try {
      await raise.mutateAsync(prompt)
      setSignalOpen(false)
      setSignalPrompt('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not raise your signal. Try again.')
    }
  }

  const typingNames = [...typing]
    .map((id) => memberMap.get(id)?.display_name)
    .filter(Boolean) as string[]
  const typingLabel =
    typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : typingNames.length > 1
        ? 'Several people are typing…'
        : null

  return (
    <section aria-label="The room" className="flex min-h-0 flex-col gap-4 lg:h-full">
      {replacement.data && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-tertiary/20 bg-tertiary-container/10 px-3 py-2.5 text-xs text-tertiary"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tertiary-container/25">
            <UserPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">A spot just opened</span>
            <span className="block text-tertiary/70">
              We're {members.data ? members.data.length : '…'} of {CLUSTER_SIZE}, finding a new member.
            </span>
          </span>
        </div>
      )}
      {/* Scroll surface: the timeline scrolls inside the room on desktop; on
       small screens the whole page scrolls instead. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      {messages.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the room…
        </div>
      ) : timeline.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center text-sm text-on-surface-variant">
          Nothing here yet. Say hello to your cluster.
        </div>
      ) : (
        <>
        {hasMore && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={() => void handleLoadEarlier()}
              disabled={loadEarlier.isPending}
              className="inline-flex items-center gap-1.5 rounded-pill border border-outline-variant/60 bg-surface px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
            >
              {loadEarlier.isPending ? 'Loading earlier messages…' : 'Load earlier messages'}
            </button>
          </div>
        )}
        <ul className="space-y-1" aria-label="Room timeline">
          {timeline.map((item, i) => {
            const prev = timeline[i - 1]
            const showDay = !prev || dayKey(prev.data.created_at) !== dayKey(item.data.created_at)

            if (item.kind === 'message') {
              const m = item.data
              const mine = m.author_id === userId
              const author = memberMap.get(m.author_id)
              const msgReactions = reactionsByMessage.get(m.id) ?? []
              const grouped = new Map<string, number>()
              for (const r of msgReactions) grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1)
              const isEditing = editingId === m.id
              const gifUrl = m.content?.startsWith('gif:') ? m.content.slice(4) : null
              return (
                <li key={m.id}>
                  {showDay && <DayDivider iso={m.created_at} />}
                  <div
                    className={cn(
                      'flex items-end gap-2 py-1',
                      mine ? 'flex-row-reverse' : 'flex-row',
                    )}
                  >
                    <Avatar
                      name={author?.display_name ?? 'Member'}
                      src={author?.avatar_url}
                      className="h-7 w-7"
                      textClassName="text-xs"
                    />
                    <div className={cn('max-w-[78%] sm:max-w-[70%]', mine ? 'items-end' : 'items-start')}>
                      <p
                        className={cn(
                          'mb-0.5 flex items-baseline gap-2 text-xs',
                          mine ? 'justify-end' : 'justify-start',
                        )}
                      >
                        <span className="font-semibold text-on-surface-variant">
                          {mine ? 'You' : author?.display_name ?? 'Member'}
                        </span>
                        <span className="text-on-surface-variant/60">
                          {timeFormatter.format(new Date(m.created_at))}
                        </span>
                        {mine && (
                          <button
                            type="button"
                            aria-label="Message actions"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMenuFor(menuFor === m.id ? null : m.id)
                            }}
                            className="grid h-6 w-6 place-items-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-surface-container hover:text-on-surface"
                          >
                            <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                          </button>
                        )}
                      </p>

                      {menuFor === m.id && (
                        <div
                          className="mb-1 flex w-max gap-1 rounded-xl border border-outline-variant/60 bg-surface p-1 shadow-soft"
                          role="menu"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => startEdit(m)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> Edit
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void remove(m.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error-container/50"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> Delete
                          </button>
                        </div>
                      )}

                      <div
                        className={
                          isEditing
                            ? 'rounded-2xl border border-outline-variant/60 bg-surface p-2'
                            : cn(
                                'rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-soft',
                                'whitespace-pre-wrap break-words',
                                mine
                                  ? 'rounded-br-md bg-primary text-on-primary'
                                  : 'rounded-bl-md bg-surface-low text-on-surface',
                              )
                        }
                      >
                        {isEditing ? (
                          <div className="flex items-end gap-2">
                            <textarea
                              aria-label="Edit message"
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                  e.preventDefault()
                                  void saveEdit()
                                }
                              }}
                              rows={2}
                              className="min-w-0 flex-1 resize-none rounded-lg border border-outline-variant/70 bg-surface-lowest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
                            />
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                aria-label="Save edit"
                                disabled={!editDraft.trim() || editMessage.isPending}
                                onClick={() => void saveEdit()}
                                className="grid h-9 w-9 place-items-center rounded-full text-primary transition-colors hover:bg-primary-container/40 disabled:opacity-40"
                              >
                                {editMessage.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                  <Send className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                                )}
                              </button>
                              <button
                                type="button"
                                aria-label="Cancel edit"
                                onClick={() => setEditingId(null)}
                                className="grid h-9 w-9 place-items-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
                              >
                                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                              </button>
                            </div>
                          </div>
                        ) : m.image_url ? (
                          m.moderation_status === 'approved' ? (
                            <MessageImage path={m.image_url} alt={m.content ?? 'Shared image'} />
                          ) : (
                            <span className="flex items-center gap-2 rounded-xl bg-surface-container/50 px-4 py-3 text-xs text-on-surface-variant">
                              <ShieldOff className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                              This image was hidden by moderation.
                            </span>
                          )
                        ) : gifUrl ? (
                          <img src={gifUrl} alt="GIF" className="max-h-72 w-full rounded-xl object-cover" />
                        ) : (
                          <MentionText
                            content={m.content ?? ''}
                            members={parseMembers}
                            clusterId={clusterId}
                            own={mine}
                          />
                        )}
                        {!isEditing && m.edited_at && (
                          <span className="ml-1 text-xs opacity-70" aria-label="edited">
                            (edited)
                          </span>
                        )}
                      </div>

                      <div
                        className={cn(
                          'mt-1 flex flex-wrap items-center gap-1',
                          mine ? 'justify-end' : 'justify-start',
                        )}
                      >
                        {[...grouped.entries()].map(([emoji, count]) => (
                          <button
                            key={emoji}
                            type="button"
                            aria-label={`React ${emoji}`}
                            aria-pressed={myReactionKeys.has(`${m.id}:${emoji}`)}
                            onClick={() => void handleToggleReaction(m.id, emoji)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-xs transition-colors',
                              myReactionKeys.has(`${m.id}:${emoji}`)
                                ? 'border-primary/50 bg-primary/10 text-on-surface'
                                : 'border-outline-variant/60 bg-surface text-on-surface-variant hover:bg-surface-container',
                            )}
                          >
                            <span aria-hidden>{emoji}</span>
                            <span>{count}</span>
                          </button>
                        ))}
                        {pickerFor === m.id ? (
                          <div className="inline-flex items-center gap-1 rounded-pill border border-outline-variant/60 bg-surface px-2 py-1 shadow-soft" onClick={(e) => e.stopPropagation()}>
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                aria-label={`Add ${emoji}`}
                                onClick={() => {
                                  void handleToggleReaction(m.id, emoji)
                                  setPickerFor(null)
                                }}
                                className="grid h-7 w-7 place-items-center rounded-full text-base transition-colors hover:bg-surface-container"
                              >
                                <span aria-hidden>{emoji}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label="Add reaction"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPickerFor(pickerFor === m.id ? null : m.id)
                            }}
                            className="grid h-7 w-7 place-items-center rounded-full border border-outline-variant/60 bg-surface text-sm text-on-surface-variant transition-colors hover:bg-surface-container"
                          >
                            <span aria-hidden>+</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              )
            }

            if (item.kind === 'signal') {
              const s = item.data
              const author = memberMap.get(s.author_id)
              return (
                <li key={`signal-${s.id}`}>
                  {showDay && <DayDivider iso={s.created_at} />}
                  <Link
                    to={`/cluster/${clusterId}/signals/${s.id}`}
                    className="my-1 flex items-start gap-2.5 rounded-xl border border-outline-variant/40 bg-surface-low/60 px-3 py-2.5 transition-colors hover:border-outline/60"
                  >
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tertiary-container/25 text-tertiary">
                      <Megaphone className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 text-sm leading-5 text-on-surface">
                        {s.prompt}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-on-surface-variant">
                        {author?.display_name ?? 'Member'}
                        {s.author_id === userId ? ' (you)' : ''} ·{' '}
                        {dateTimeFormatter.format(new Date(s.created_at))} ·{' '}
                        <span className="font-medium text-on-surface-variant">
                          {SIGNAL_STATUS[s.status].label}
                        </span>
                        <span>· {replyCount.get(s.id) ?? 0} replies</span>
                      </span>
                    </span>
                  </Link>
                </li>
              )
            }

            const v = item.data
            const initiator = memberMap.get(v.initiated_by)
            const target = v.target_member_id ? memberMap.get(v.target_member_id) : null
            const title =
              v.type === 'change_name'
                ? `Rename to “${v.name_suggestion ?? '?'}”`
                : v.type === 'replace_member'
                  ? `Replace ${target?.display_name ?? 'a member'}`
                  : 'Choose a new member'
            return (
              <li key={`vote-${v.id}`}>
                {showDay && <DayDivider iso={v.created_at} />}
                <Link
                  to={`/cluster/${clusterId}/votes`}
                  className="my-1 flex items-start gap-2.5 rounded-xl border border-outline-variant/40 bg-surface-low/60 px-3 py-2.5 transition-colors hover:border-outline/60"
                >
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Scale className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block line-clamp-2 text-sm leading-5 text-on-surface">
                      {VOTE_TYPE_LABEL[v.type]}: {title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-on-surface-variant">
                      {initiator?.display_name ?? 'Member'}
                      {v.initiated_by === userId ? ' (you)' : ''} ·{' '}
                      {dateTimeFormatter.format(new Date(v.created_at))} · Ends in{' '}
                      <CountdownTimer deadline={v.closes_at} />
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        </>
      )}
      <div ref={endRef} aria-hidden />
      </div>

      {!pinned && newCount > 0 && (
        <button
          type="button"
          aria-label={`Jump to ${newCount} new message${newCount === 1 ? '' : 's'}`}
          onClick={() => {
            scrollToEnd()
            pinnedRef.current = true
            setPinned(true)
            setNewCount(0)
          }}
          className="fixed bottom-[calc(var(--bottom-nav-offset)+5rem)] left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-pill border border-outline-variant/60 bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-soft transition-colors hover:bg-primary-container"
        >
          <ArrowDown className="h-4 w-4" strokeWidth={2} aria-hidden />
          {newCount} new message{newCount === 1 ? '' : 's'}
        </button>
      )}

      {typingLabel && (
        <p className="text-xs text-on-surface-variant" aria-live="polite">
          {typingLabel}
        </p>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      <form
        className="sticky bottom-[var(--bottom-nav-offset)] flex shrink-0 items-end gap-2 border-t border-outline-variant/60 bg-background py-3 lg:static"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSend()
        }}
      >
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
            disabled={raise.isPending}
            onClick={(e) => {
              e.stopPropagation()
              setComposerOpen((open) => !open)
            }}
            className="grid h-10 w-10 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60 sm:h-11 sm:w-11"
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
              className="absolute bottom-full left-0 z-20 mb-2 flex w-max flex-col gap-1 rounded-2xl border border-outline-variant/60 bg-surface p-1 shadow-soft"
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
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
              >
                <ImagePlus className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Send an image
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={raise.isPending}
                onClick={() => {
                  setComposerOpen(false)
                  setSignalOpen(true)
                }}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container hover:text-tertiary disabled:opacity-60"
              >
                <Megaphone className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Raise a signal
              </button>
            </div>
          )}
        </div>
        <label htmlFor="room-input" className="sr-only">
          Message
        </label>
        <div className="relative min-w-0 flex-1">
          {mention && mentionCandidates.length > 0 && (
            <div
              id="mention-listbox"
              role="listbox"
              aria-label="Mention a member"
              className="absolute bottom-full left-0 z-20 mb-2 w-max min-w-44 max-w-full overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface p-1 shadow-soft"
            >
              {mentionCandidates.map((candidate, i) => (
                <button
                  key={candidate.id}
                  id={`mention-option-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === mentionIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMention(candidate)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-on-surface transition-colors',
                    i === mentionIndex ? 'bg-surface-container' : 'hover:bg-surface-container/60',
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
              ))}
            </div>
          )}
          <TextareaAutosize
            ref={inputRef}
            id="room-input"
            role="combobox"
            minRows={1}
            maxRows={5}
            aria-expanded={mention !== null && mentionCandidates.length > 0}
            aria-controls="mention-listbox"
            aria-autocomplete="list"
            aria-activedescendant={
              mention && mentionCandidates.length > 0 ? `mention-option-${mentionIndex}` : undefined
            }
            value={draft}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={() => {
              resetTyping()
              setMention(null)
            }}
            placeholder="Write to your cluster…"
            maxLength={2000}
            className="min-w-0 w-full flex-1 resize-none overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-2.5 text-sm leading-5 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={!draft.trim() || send.isPending || uploading}
          aria-label="Send message"
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-container transition-colors disabled:opacity-60 sm:h-11 sm:w-11',
            draft.trim() ? 'text-primary' : 'text-on-surface-variant',
          )}
        >
          {send.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <Send className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          )}
        </button>
      </form>

      <Modal open={signalOpen} onClose={() => setSignalOpen(false)} title="Raise a signal">
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void handleRaise()
          }}
        >
          <label htmlFor="room-signal-prompt" className="sr-only">
            What do you need help with?
          </label>
          <textarea
            id="room-signal-prompt"
            rows={4}
            maxLength={MAX_SIGNAL_PROMPT}
            autoFocus
            value={signalPrompt}
            onChange={(e) => setSignalPrompt(e.target.value)}
            placeholder="What do you need help with?"
            className="w-full resize-none rounded-xl border border-outline-variant/70 bg-surface-lowest px-4 py-3 text-sm leading-6 text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-on-surface-variant">
              {signalPrompt.length}/{MAX_SIGNAL_PROMPT}
            </span>
            <div className="flex items-center gap-2">
              {error && <span className="text-xs text-error">{error}</span>}
              <button
                type="button"
                onClick={() => setSignalOpen(false)}
                className="rounded-pill px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!signalPrompt.trim() || raise.isPending}
                className="rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
              >
                {raise.isPending ? 'Raising…' : 'Raise signal'}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </section>
  )
}

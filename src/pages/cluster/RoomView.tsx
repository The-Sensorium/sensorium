import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, Loader2 } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { cn } from '../../lib/utils'
import { useAuth } from '../../app/auth-context'
import { useClusterMembers } from '../../features/matching'
import type { MentionMember } from '../../features/mentions'
import { Avatar } from '../../components/Avatar'
import {
  CHAT_PAGE_SIZE,
  useClusterMessages,
  useClusterReactions,
  useDeleteMessage,
  useEditMessage,
  useLoadEarlierMessages,
  useMessageReads,
  useReplyTargets,
  useSendMessage,
  useToggleReaction,
  uploadChatImage,
  deleteChatImage,
  type Message,
  type Reaction,
} from '../../features/cluster'
import { useClusterSignals, useSignalReplies, useRaiseSignal, type Signal } from '../../features/signals'
import { useClusterVotes, type Vote } from '../../features/votes'
import { useMarkClusterRead } from '../../features/notifications'
import { toErrorMessage } from '../../lib/error'
import { usePresence } from '../../features/realtime'
import { Composer } from './room/Composer'
import { type Gif } from '../../features/gifs'
import { MessageItem } from './room/MessageItem'
import { MessageInfoModal } from './room/MessageInfoModal'
import { notSeenByMembers, seenByMembers } from './room/seen-by'
import { RaiseSignalModal } from './room/RaiseSignalModal'
import { TypingBubble } from './room/TypingBubble'
import { SignalRow } from './room/SignalRow'
import { VoteRow } from './room/VoteRow'

type TimelineItem =
  | { kind: 'message'; data: Message }
  | { kind: 'signal'; data: Signal }
  | { kind: 'vote'; data: Vote }

function dayKey(iso: string) {
  return iso.slice(0, 10)
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
  const send = useSendMessage()
  const toggleReaction = useToggleReaction(clusterId)
  const editMessage = useEditMessage(clusterId)
  const deleteMessage = useDeleteMessage(clusterId)
  const raise = useRaiseSignal(clusterId)
  const markRead = useMarkClusterRead()
  const { typing, signalTyping, resetTyping, online } = usePresence(clusterId)

  const memberCount = (members.data ?? []).length
  const onlineCount = (members.data ?? []).filter((m) => online.has(m.id) || m.id === userId).length

  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [infoFor, setInfoFor] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [signalOpen, setSignalOpen] = useState(false)
  const [signalPrompt, setSignalPrompt] = useState('')
  const [pinned, setPinned] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const exhaustedRef = useRef(false)
  const prevOldestIdRef = useRef<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const lastLenRef = useRef<number | null>(null)
  const anchorRef = useRef<{
    surface: 'container' | 'page'
    scrollTop: number
    scrollHeight: number
  } | null>(null)

  const memberMap = useMemo(() => {
    const map = new Map<string, { id: string; display_name: string; avatar_url: string | null }>()
    for (const m of members.data ?? []) {
      map.set(m.id, { id: m.id, display_name: m.display_name, avatar_url: m.avatar_url })
    }
    return map
  }, [members.data])

  const loadedById = useMemo(() => {
    const map = new Map<string, Message>()
    for (const m of messages.data ?? []) map.set(m.id, m)
    return map
  }, [messages.data])

  // A reply can point at a message that scrolled out of the loaded window; fetch
  // any parents we don't already have and merge them into the lookup.
  const missingParentIds = useMemo(
    () =>
      (messages.data ?? [])
        .map((m) => m.reply_to_id)
        .filter((id): id is string => Boolean(id))
        .filter((id) => !loadedById.has(id)),
    [messages.data, loadedById],
  )
  const replyTargets = useReplyTargets(clusterId, missingParentIds)
  const replyById = useMemo(() => {
    const map = new Map<string, Message>(loadedById)
    for (const [id, m] of replyTargets.data ?? []) map.set(id, m)
    return map
  }, [loadedById, replyTargets.data])

  function replyPreview(
    target:
      | {
          author_id: string
          content: string | null
          image_url: string | null
          deleted_at: string | null
        }
      | null
      | undefined,
  ): { authorName: string; preview: string } | undefined {
    // A deleted parent is hidden from the timeline, so its quote shouldn't
    // surface either - treat it like a missing target (fallback rendering).
    if (!target || target.deleted_at) return undefined
    const authorName = memberMap.get(target.author_id)?.display_name ?? 'Member'
    const preview = target.content?.startsWith('gif:')
      ? 'GIF'
      : target.image_url
        ? 'Image'
        : (target.content ?? '')
    return { authorName, preview }
  }

  function startReply(m: Message) {
    setMenuFor(null)
    setPickerFor(null)
    setReplyTo(m)
  }

  const replyParentInfo = (() => {
    if (!replyTo) return null
    const info = replyPreview(replyTo)
    return info ? { id: replyTo.id, ...info } : null
  })()
  const cancelReply = () => setReplyTo(null)

  // All members, used to render mention chips in the timeline (others can mention you).
  const parseMembers = useMemo<MentionMember[]>(() => {
    return (members.data ?? []).map((m) => ({
      id: m.id,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
    }))
  }, [members.data])

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

  // Read receipts for the message whose Info action was tapped. read_at comes
  // from message_reads (0049), a per-message timestamp frozen on first read, so
  // an open dialog updates as members read without their times marching to the
  // current clock. Realtime refresh rides the cluster_members UPDATE handler.
  const infoMessage = useMemo(
    () => (infoFor ? (messages.data ?? []).find((m) => m.id === infoFor) ?? null : null),
    [infoFor, messages.data],
  )
  const messageReads = useMessageReads(clusterId, infoMessage?.id ?? null)
  const readIds = useMemo(
    () => new Set((messageReads.data ?? []).map((r) => r.id)),
    [messageReads.data],
  )
  const infoSeen = useMemo(
    () => (infoMessage ? seenByMembers(messageReads.data ?? [], infoMessage.author_id) : []),
    [infoMessage, messageReads.data],
  )
  const infoNotSeen = useMemo(
    () => (infoMessage ? notSeenByMembers(infoMessage, members.data ?? [], readIds) : []),
    [infoMessage, members.data, readIds],
  )

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
    setReplyTo(null)
  }, [clusterId])

  // Auto-follow the newest message while the user is near the bottom. Once they
  // scroll up to read, stop following and count what arrives instead. The room
  // is a fixed-height band on every screen size, so the timeline always scrolls
  // inside its container. Read whichever surface is actually scrollable.
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

  async function persistSend(content: string) {
    if (!clusterId) return
    await send.mutateAsync({ clusterId, content, replyToId: replyTo?.id ?? undefined })
    setReplyTo(null)
  }

  async function persistSendImage(file: File) {
    if (!clusterId) return
    const path = await uploadChatImage(clusterId, file)
    try {
      await send.mutateAsync({ clusterId, content: null, imageUrl: path, replyToId: replyTo?.id ?? undefined })
      setReplyTo(null)
    } catch (e) {
      // The upload succeeded but the message never landed — reclaim the object so
      // a straggling image isn't left behind (member-scoped delete, migration 0050).
      await deleteChatImage(path).catch(() => {})
      throw e
    }
  }

  async function persistSendGif(gif: Gif) {
    if (!clusterId) return
    await send.mutateAsync({ clusterId, content: `gif:${gif.url}`, replyToId: replyTo?.id ?? undefined })
    setReplyTo(null)
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    setError(null)
    try {
      await toggleReaction.mutateAsync({ messageId, emoji })
    } catch (e) {
      setError(toErrorMessage(e, 'Could not react to that message.'))
    }
  }

  function startEdit(m: { id: string; content: string | null }) {
    setMenuFor(null)
    setEditingId(m.id)
    setEditDraft(m.content ?? '')
  }

  function showInfo(m: Message) {
    setMenuFor(null)
    setPickerFor(null)
    setInfoFor(m.id)
  }

  async function saveEdit() {
    const content = editDraft.trim()
    if (!content || !editingId) return
    setError(null)
    try {
      await editMessage.mutateAsync({ messageId: editingId, content })
      setEditingId(null)
    } catch (e) {
      setError(toErrorMessage(e, 'Could not edit your message.'))
    }
  }

  async function remove(messageId: string) {
    setMenuFor(null)
    setError(null)
    try {
      await deleteMessage.mutateAsync(messageId)
    } catch (e) {
      setError(toErrorMessage(e, 'Could not delete your message.'))
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
      setError(toErrorMessage(e, 'Could not load earlier messages.'))
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
      setError(toErrorMessage(e, 'Could not raise your signal. Try again.'))
    }
  }

  const typingMembers = [...typing]
    .map((id) => memberMap.get(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))

  // Keep the view pinned when a typing bubble appears or another member joins in
  // while the user is at the bottom, so the indicator lands in view instead of
  // below the fold. No-op while scrolled up (like the "jump to latest" affordance).
  const typingKey = [...typing].sort().join(',')
  useEffect(() => {
    if (typingMembers.length > 0 && pinnedRef.current) scrollToEnd()
  }, [typingKey, typingMembers.length])

  return (
    <section aria-label="The room" className="flex min-h-0 flex-1 flex-col gap-4 lg:h-full">
      {/* Scroll surface: the room is a fixed-height band (mobile and desktop) so
       the timeline scrolls inside the container and the page never moves. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* Presence strip - a quiet row of faces. Lives at the top of the
         timeline so it scrolls out of the way while reading, leaving the chat
         the full room band. */}
        <section
          aria-label="Who is in the room"
          className="mb-3 rounded-2xl border border-outline-variant/60 bg-surface px-4 py-3 shadow-soft"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-on-surface">
                In the room now
              </h2>
              <span className="text-xs text-on-surface-variant">
                {onlineCount} of {memberCount} here
              </span>
            </div>
            <ul className="flex flex-wrap items-center gap-2">
              {(members.data ?? []).map((m) => {
                const isMe = m.id === userId
                return (
                  <li key={m.id}>
                    <Link
                      to={`/profile/${m.id}?cluster=${clusterId}`}
                      title={`${m.display_name}${isMe ? ' (you)' : ''}`}
                      className="relative block"
                    >
                      <Avatar
                        name={m.display_name}
                        src={m.avatar_url}
                        className={cn('h-7 w-7', isMe && 'ring-2 ring-primary')}
                        textClassName="text-xs"
                      />
                      {online.has(m.id) || isMe ? (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-emerald-500"
                          aria-hidden
                        />
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
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
                const showDay =
                  !prev || dayKey(prev.data.created_at) !== dayKey(item.data.created_at)

                if (item.kind === 'message') {
                  const m = item.data
                  return (
                    <MessageItem
                      key={m.id}
                      message={m}
                      mine={m.author_id === userId}
                      author={memberMap.get(m.author_id)}
                      reactions={reactionsByMessage.get(m.id) ?? []}
                      myReactionKeys={myReactionKeys}
                      members={parseMembers}
                      clusterId={clusterId}
                      showDay={showDay}
                      isEditing={editingId === m.id}
                      editDraft={editDraft}
                      editPending={editMessage.isPending}
                      menuOpen={menuFor === m.id}
                      pickerOpen={pickerFor === m.id}
                      replyParent={replyPreview(replyById.get(m.reply_to_id ?? ''))}
                      onEditDraftChange={setEditDraft}
                      onSaveEdit={() => void saveEdit()}
                      onCancelEdit={() => setEditingId(null)}
                      onToggleMenu={() => setMenuFor(menuFor === m.id ? null : m.id)}
                      onTogglePicker={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                      onShowInfo={showInfo}
                      onEdit={startEdit}
                      onDelete={(messageId) => void remove(messageId)}
                      onReply={startReply}
                      onToggleReaction={(messageId, emoji) =>
                        void handleToggleReaction(messageId, emoji)
                      }
                    />
                  )
                }

                if (item.kind === 'signal') {
                  const s = item.data
                  return (
                    <SignalRow
                      key={`signal-${s.id}`}
                      signal={s}
                      author={memberMap.get(s.author_id)}
                      isMine={s.author_id === userId}
                      replyCount={replyCount.get(s.id) ?? 0}
                      clusterId={clusterId}
                      showDay={showDay}
                    />
                  )
                }

                const v = item.data
                return (
                  <VoteRow
                    key={`vote-${v.id}`}
                    vote={v}
                    initiator={memberMap.get(v.initiated_by)}
                    target={v.target_member_id ? memberMap.get(v.target_member_id) : undefined}
                    isMine={v.initiated_by === userId}
                    clusterId={clusterId}
                    showDay={showDay}
                  />
                )
              })}
            </ul>
          </>
        )}
        {typingMembers.length > 0 && (
          <ul aria-label="Typing in the room" className="space-y-1">
            {typingMembers.map((m) => (
              <TypingBubble
                key={m.id}
                name={m.display_name}
                avatarUrl={m.avatar_url}
                clusterId={clusterId}
                userId={m.id}
              />
            ))}
          </ul>
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
          className="fixed bottom-[calc(var(--bottom-nav-offset)+6.5rem)] left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-pill border border-outline-variant/60 bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-soft transition-colors hover:bg-primary-container"
        >
          <ArrowDown className="h-4 w-4" strokeWidth={2} aria-hidden />
          {newCount} new message{newCount === 1 ? '' : 's'}
        </button>
      )}

      <Composer
        members={parseMembers}
        selfId={userId}
        pending={send.isPending}
        raisePending={raise.isPending}
        error={error}
        replyTo={replyParentInfo ?? null}
        onError={setError}
        onTyping={signalTyping}
        onStopTyping={resetTyping}
        onSend={persistSend}
        onSendImage={persistSendImage}
        onSendGif={persistSendGif}
        onOpenSignal={() => setSignalOpen(true)}
        onCancelReply={cancelReply}
      />

      <RaiseSignalModal
        open={signalOpen}
        error={error}
        prompt={signalPrompt}
        pending={raise.isPending}
        onPromptChange={setSignalPrompt}
        onClose={() => setSignalOpen(false)}
        onRaise={() => void handleRaise()}
      />

      <MessageInfoModal
        open={infoFor !== null}
        onClose={() => setInfoFor(null)}
        clusterId={clusterId}
        seen={infoSeen}
        notSeen={infoNotSeen}
      />
    </section>
  )
}

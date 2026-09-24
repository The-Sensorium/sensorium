import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ChevronRight, Phone, Users } from 'lucide-react-native'
import { useAuth } from '../../../../src/auth-context'
import { useClusterMembers } from '../../../../src/features/matching'
import type { MentionMember } from '../../../../src/features/mentions'
import { Avatar } from '../../../../src/components/Avatar'
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
} from '../../../../src/features/cluster'
import { useCluster } from '../../../../src/features/introductions'
import { useClusterSignals, useSignalReplies, useRaiseSignal, type Signal } from '../../../../src/features/signals'
import { useClusterVotes, type Vote } from '../../../../src/features/votes'
import {
  useActiveCall,
  useCallParticipants,
  useJoinCall,
  useStartCall,
} from '../../../../src/features/cluster-calls'
import { useMarkClusterRead } from '../../../../src/features/notifications'
import { clearClusterPushNotifications } from '../../../../src/lib/push'
import { getSuppressedPushCluster, setSuppressedPushCluster } from '../../../../src/lib/push-suppress'
import { isMutedAuthor, mutedIds, toggleRevealedId, useMyMutes } from '../../../../src/features/moderation'
import { MutedHideBar, MutedPlaceholder } from '../../../../src/components/MutedPlaceholder'
import { toErrorMessage } from '../../../../src/lib/error'
import { errorHaptic, lightHaptic, successHaptic } from '../../../../src/lib/haptics'
import { useClusterChannel, usePresence } from '../../../../src/features/realtime'
import { Composer, type PickedImage } from '../../../../src/components/room/Composer'
import { IntroChecklistBanner } from '../../../../src/components/IntroChecklistBanner'
import { type Gif } from '../../../../src/features/gifs'
import { MessageItem } from '../../../../src/components/room/MessageItem'
import { MessageInfoModal } from '../../../../src/components/room/MessageInfoModal'
import { notSeenByMembers, seenByMembers } from '../../../../src/components/room/seen-by'
import { RaiseSignalModal } from '../../../../src/components/room/RaiseSignalModal'
import { TypingBubble } from '../../../../src/components/room/TypingBubble'
import { SignalRow, VoteRow } from '../../../../src/components/room/TimelineRows'
import { ReportModal } from '../../../../src/components/ReportModal'
import { Modal } from '../../../../src/components/Modal'
import { PrimaryButton } from '../../../../src/components/ui'
import { ClusterMenu } from '../../../../src/components/ClusterMenu'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { useResolvedScheme } from '../../../../src/lib/theme-choice'

type TimelineItem =
  | { kind: 'message'; data: Message }
  | { kind: 'signal'; data: Signal }
  | { kind: 'vote'; data: Vote }

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

type MemberInfo = { id: string; display_name: string; avatar_url: string | null }

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
  memberMap: Map<string, MemberInfo>,
): { authorName: string; preview: string } | undefined {
  if (!target || target.deleted_at) return undefined
  const authorName = memberMap.get(target.author_id)?.display_name ?? 'Member'
  const preview = target.content?.startsWith('gif:')
    ? 'GIF'
    : target.image_url
      ? 'Image'
      : (target.content ?? '')
  return { authorName, preview }
}

const EMPTY_REACTIONS: Reaction[] = []

export default function RoomScreen() {
  const t = useTheme()
  const scheme = useResolvedScheme()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const authed = auth.state === 'signedIn'
  // Never fetch or subscribe before the session is restored: a pre-session
  // request fails RLS (permanent error, no retry) and a pre-session channel
  // receives nothing, leaving a push-tapped room stuck without its message.
  const authedClusterId = authed ? clusterId || null : null

  useClusterChannel(authedClusterId)
  useFocusEffect(
    useCallback(() => {
      setSuppressedPushCluster(clusterId || null)
      if (clusterId) void clearClusterPushNotifications(clusterId)
      return () => {
        if (getSuppressedPushCluster() === (clusterId || null)) setSuppressedPushCluster(null)
      }
    }, [clusterId]),
  )
  const cluster = useCluster(authedClusterId)
  const messages = useClusterMessages(authedClusterId)
  const loadedMessageIds = useMemo(() => (messages.data ?? []).map((m) => m.id), [messages.data])
  const reactions = useClusterReactions(authedClusterId)
  const loadEarlier = useLoadEarlierMessages(authedClusterId)
  const loadEarlierMutate = loadEarlier.mutateAsync
  const queryClient = useQueryClient()
  const signals = useClusterSignals(authedClusterId)
  const signalReplies = useSignalReplies(authedClusterId, null)
  const votes = useClusterVotes(authedClusterId)
  const members = useClusterMembers(authedClusterId)
  const send = useSendMessage()
  const toggleReaction = useToggleReaction(clusterId || null)
  const editMessage = useEditMessage(clusterId || null)
  const deleteMessage = useDeleteMessage(clusterId || null)
  // Bound mutate fns are referentially stable across renders (the mutation
  // result object is not), so callbacks below can depend on them directly.
  const toggleReactionMutate = toggleReaction.mutateAsync
  const editMessageMutate = editMessage.mutateAsync
  const deleteMessageMutate = deleteMessage.mutateAsync
  const raise = useRaiseSignal(clusterId || null)
  const markRead = useMarkClusterRead()
  const myMutes = useMyMutes(authedClusterId !== null)
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  function toggleReveal(id: string) {
    setRevealed((prev) => toggleRevealedId(prev, id))
  }
  const roomClusterId = authedClusterId
  const activeCall = useActiveCall(roomClusterId)
  const callParticipants = useCallParticipants(activeCall.data?.id ?? null)
  const startCall = useStartCall(roomClusterId)
  const joinCall = useJoinCall(roomClusterId)
  const joinedCall = (callParticipants.data ?? []).some((p) => p.user_id === userId)
  const callPending = startCall.isPending || joinCall.isPending

  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [infoFor, setInfoFor] = useState<string | null>(null)
  const [reportFor, setReportFor] = useState<Message | null>(null)
  const [deleteFor, setDeleteFor] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [signalOpen, setSignalOpen] = useState(false)
  const [signalPrompt, setSignalPrompt] = useState('')
  const [pinned, setPinned] = useState(true)
  const [focused, setFocused] = useState(false)
  const [newCount, setNewCount] = useState(0)
  // Presence (and its typing/online re-renders) only runs while this screen
  // is focused: tab screens stay mounted, so a background room must not
  // subscribe, animate, or re-render on other screens' keyboard sessions.
  const { typing, signalTyping, resetTyping, online } = usePresence(focused ? clusterId || null : null)
  const memberCount = (members.data ?? []).length
  const onlineCount = (members.data ?? []).filter((m) => online.has(m.id) || m.id === userId).length
  const [hasMore, setHasMore] = useState(false)
  const [declinedCalls, setDeclinedCalls] = useState<Set<string>>(new Set())
  const exhaustedRef = useRef(false)
  const prevOldestIdRef = useRef<string | null>(null)
  const pinnedRef = useRef(true)
  const lastLenRef = useRef<number | null>(null)
  const listRef = useRef<FlatList<{ key: string; item: TimelineItem; showDay: boolean }> | null>(null)

  useEffect(() => {
    lastLenRef.current = null
    pinnedRef.current = true
    setPinned(true)
    setNewCount(0)
    exhaustedRef.current = false
    setHasMore(false)
    prevOldestIdRef.current = null
    setReplyTo(null)
    setDeclinedCalls(new Set())
  }, [clusterId])

  const memberMap = useMemo(() => {
    const map = new Map<string, MemberInfo>()
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

  const missingParentIds = useMemo(
    () =>
      (messages.data ?? [])
        .map((m) => m.reply_to_id)
        .filter((id): id is string => Boolean(id))
        .filter((id) => !loadedById.has(id)),
    [messages.data, loadedById],
  )
  const replyTargets = useReplyTargets(authedClusterId, missingParentIds)
  const replyById = useMemo(() => {
    const map = new Map<string, Message>(loadedById)
    for (const [id, m] of replyTargets.data ?? []) map.set(id, m)
    return map
  }, [loadedById, replyTargets.data])

  const replyParentMap = useMemo(() => {
    const referenced = new Set<string>()
    for (const m of messages.data ?? []) {
      if (m.reply_to_id) referenced.add(m.reply_to_id)
    }
    const map = new Map<string, { authorName: string; preview: string }>()
    if (referenced.size === 0) return map
    for (const [id, parent] of replyById) {
      if (!referenced.has(id)) continue
      if (!parent || isMutedAuthor(mutedSet, parent.author_id)) continue
      const info = replyPreview(parent, memberMap)
      if (info) map.set(id, info)
    }
    return map
  }, [messages.data, replyById, mutedSet, memberMap])

  const startReply = useCallback((m: Message) => {
    setMenuFor(null)
    setReplyTo(m)
  }, [setMenuFor, setReplyTo])

  const replyParentInfo = useMemo(() => {
    if (!replyTo) return null
    const info = replyPreview(replyTo, memberMap)
    return info ? { id: replyTo.id, ...info } : null
  }, [replyTo, memberMap])

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

  const infoMessage = useMemo(
    () => (infoFor ? (messages.data ?? []).find((m) => m.id === infoFor) ?? null : null),
    [infoFor, messages.data],
  )
  const messageReads = useMessageReads(authedClusterId, infoMessage?.id ?? null)
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

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...(messages.data ?? [])
        .filter((m) => !m.deleted_at)
        .map((m) => ({ kind: 'message' as const, data: m })),
      ...(signals.data ?? [])
        .filter((s) => s.status !== 'resolved')
        .map((s) => ({ kind: 'signal' as const, data: s })),
      ...(votes.data ?? [])
        .filter((v) => v.status === 'open' && v.type !== 'select_candidate')
        .map((v) => ({ kind: 'vote' as const, data: v })),
    ]
    return items.sort((a, b) => a.data.created_at.localeCompare(b.data.created_at))
  }, [messages.data, signals.data, votes.data])

  const rows = useMemo(
    () =>
      timeline
        .map((item, i) => ({
          key: item.kind === 'message' ? item.data.id : `${item.kind}-${item.data.id}`,
          item,
          showDay: i === 0 || dayKey(timeline[i - 1]!.data.created_at) !== dayKey(item.data.created_at),
        }))
        .reverse(),
    [timeline],
  )

  useEffect(() => {
    const len = rows.length
    const prev = lastLenRef.current
    lastLenRef.current = len
    if (prev === null) return
    if (len > prev) {
      if (pinnedRef.current) {
        listRef.current?.scrollToOffset({ offset: 0, animated: true })
      } else {
        setNewCount((c) => c + (len - prev))
      }
    }
  }, [rows.length])

  useEffect(() => {
    if (exhaustedRef.current) return
    if ((messages.data?.length ?? 0) >= CHAT_PAGE_SIZE) setHasMore(true)
  }, [messages.data])

  useEffect(() => {
    const oldestId = loadedMessageIds[0] ?? null
    if (!oldestId) return
    if (prevOldestIdRef.current === oldestId) return
    prevOldestIdRef.current = oldestId
    void queryClient.invalidateQueries({ queryKey: ['cluster-reactions', clusterId] })
  }, [loadedMessageIds, clusterId, queryClient])

  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMarkAt = useRef(0)
  const pendingMarkRef = useRef(false)
  const markRoomRead = markRead.mutate
  const clearMarkTimer = useCallback(() => {
    if (markReadTimer.current) {
      clearTimeout(markReadTimer.current)
      markReadTimer.current = null
    }
  }, [])
  const fireMark = useCallback(
    (id: string) => {
      lastMarkAt.current = Date.now()
      pendingMarkRef.current = false
      markRoomRead(id)
    },
    [markRoomRead],
  )
  useEffect(() => {
    if (!focused || !pinned || !clusterId || auth.state !== 'signedIn') return
    if (Date.now() - lastMarkAt.current >= 5_000) {
      clearMarkTimer()
      fireMark(clusterId)
      return
    }
    clearMarkTimer()
    pendingMarkRef.current = true
    markReadTimer.current = setTimeout(() => {
      markReadTimer.current = null
      fireMark(clusterId)
    }, 5_000)
    return () => {
      clearMarkTimer()
    }
  }, [focused, pinned, clusterId, messages.data, markRead, auth.state, fireMark, clearMarkTimer])

  // Leaving the screen fires a pending trailing mark instead of dropping it:
  // pinned means the new messages were on screen, so they count as read.
  // Scrolled-up readers keep their unread, which the room clears on return.
  const flushPendingMark = useCallback(() => {
    if (!pendingMarkRef.current || !pinnedRef.current || !clusterId || auth.state !== 'signedIn') return
    clearMarkTimer()
    fireMark(clusterId)
  }, [clusterId, auth.state, fireMark, clearMarkTimer])

  // One AppState subscription for both directions: flush the read marker
  // when backgrounded while pinned (never when scrolled up reading history),
  // and heal an errored message query when foregrounded (a mount fetch that
  // failed while the app was waking would otherwise sit on stale rows with
  // the new message missing until remount).
  useEffect(() => {
    if (!focused || !clusterId) return
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (!pinned || auth.state !== 'signedIn') return
        clearMarkTimer()
        fireMark(clusterId)
      } else if (state === 'active') {
        const key = ['cluster-messages', clusterId]
        if (queryClient.getQueryState(key)?.status === 'error') {
          void queryClient.invalidateQueries({ queryKey: key })
        }
      }
    })
    return () => sub.remove()
  }, [focused, pinned, clusterId, markRead, queryClient, auth.state, fireMark, clearMarkTimer])

  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => {
        flushPendingMark()
        setFocused(false)
      }
    }, [flushPendingMark]),
  )

  const typingMembers = [...typing]
    .map((id) => memberMap.get(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))

  const sendMutate = send.mutateAsync
  const persistSend = useCallback(
    async (content: string) => {
      if (!clusterId) return
      await sendMutate({ clusterId, content, replyToId: replyTo?.id ?? undefined })
      setReplyTo(null)
    },
    [clusterId, replyTo, sendMutate, setReplyTo],
  )

  const persistSendImage = useCallback(
    async (image: PickedImage, caption: string | null) => {
      if (!clusterId) return
      const path = await uploadChatImage(clusterId, image.uri, image.mime, image.width, image.height)
      try {
        await sendMutate({ clusterId, content: caption, imageUrl: path, replyToId: replyTo?.id ?? undefined })
        setReplyTo(null)
      } catch (e) {
        await deleteChatImage(path).catch(() => {})
        throw e
      }
    },
    [clusterId, replyTo, sendMutate, setReplyTo],
  )

  const persistSendGif = useCallback(
    async (gif: Gif) => {
      if (!clusterId) return
      await sendMutate({ clusterId, content: `gif:${gif.url}`, replyToId: replyTo?.id ?? undefined })
      setReplyTo(null)
    },
    [clusterId, replyTo, sendMutate, setReplyTo],
  )

  const openSignal = useCallback(() => setSignalOpen(true), [setSignalOpen])
  const cancelReply = useCallback(() => setReplyTo(null), [setReplyTo])

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      setError(null)
      try {
        await toggleReactionMutate({ messageId, emoji })
        lightHaptic()
      } catch (e) {
        errorHaptic()
        setError(toErrorMessage(e, 'Could not react to that message.'))
      }
    },
    [toggleReactionMutate, setError],
  )

  const startEdit = useCallback((m: { id: string; content: string | null }) => {
    setMenuFor(null)
    setEditingId(m.id)
    setEditDraft(m.content ?? '')
  }, [setMenuFor, setEditingId, setEditDraft])

  const showInfo = useCallback((m: Message) => {
    setMenuFor(null)
    setInfoFor(m.id)
  }, [setMenuFor, setInfoFor])

  const startReport = useCallback((m: Message) => {
    setMenuFor(null)
    setReportFor(m)
  }, [setMenuFor, setReportFor])

  const handleToggleMenu = useCallback((id: string) => {
    setMenuFor((prev) => (prev === id ? null : id))
  }, [setMenuFor])

  const handleDeleteRequest = useCallback((messageId: string) => {
    setMenuFor(null)
    setDeleteError(null)
    setDeleteFor(messageId)
  }, [setMenuFor, setDeleteError, setDeleteFor])

  const saveEdit = useCallback(async () => {
    const content = editDraft.trim()
    if (!content || !editingId) return
    setError(null)
    try {
      await editMessageMutate({ messageId: editingId, content })
      setEditingId(null)
    } catch (e) {
      setError(toErrorMessage(e, 'Could not edit your message.'))
    }
  }, [editDraft, editingId, editMessageMutate, setError, setEditingId])

  const cancelEdit = useCallback(() => setEditingId(null), [setEditingId])

  const remove = useCallback(
    async (messageId: string) => {
      setMenuFor(null)
      setDeleteError(null)
      try {
        await deleteMessageMutate(messageId)
        setDeleteFor(null)
      } catch (e) {
        setDeleteError(toErrorMessage(e, 'Could not delete your message.'))
      }
    },
    [deleteMessageMutate, setMenuFor, setDeleteError, setDeleteFor],
  )

  const messageCount = messages.data?.length ?? 0
  const handleLoadEarlier = useCallback(async () => {
    setError(null)
    try {
      const result = await loadEarlierMutate()
      lastLenRef.current = messageCount + result.added
      if (!result.hasMore) {
        exhaustedRef.current = true
        setHasMore(false)
      }
    } catch (e) {
      setError(toErrorMessage(e, 'Could not load earlier messages.'))
    }
  }, [loadEarlierMutate, messageCount, setError, setHasMore])

  async function handleRaise() {
    const prompt = signalPrompt.trim()
    if (!prompt) return
    setError(null)
    try {
      await raise.mutateAsync(prompt)
      setSignalOpen(false)
      setSignalPrompt('')
      successHaptic()
    } catch (e) {
      errorHaptic()
      setError(toErrorMessage(e, 'Could not raise your signal. Try again.'))
    }
  }

  const openCall = useCallback(
    (callId: string) => {
      router.push({ pathname: '/cluster/[clusterId]/call', params: { clusterId, callId } })
    },
    [clusterId],
  )

  const startCallMutate = startCall.mutateAsync
  const joinCallMutate = joinCall.mutateAsync
  const handleStartCall = useCallback(async () => {
    if (!clusterId) return
    setError(null)
    try {
      const callId = await startCallMutate()
      successHaptic()
      openCall(callId)
    } catch (e) {
      errorHaptic()
      setError(toErrorMessage(e, 'Could not start the call. Try again.'))
    }
  }, [clusterId, startCallMutate, openCall, setError])

  const handleJoinCall = useCallback(
    async (callId: string) => {
      setError(null)
      try {
        await joinCallMutate(callId)
        successHaptic()
        openCall(callId)
      } catch (e) {
        errorHaptic()
        setError(toErrorMessage(e, 'Could not join the call. Try again.'))
      }
    },
    [joinCallMutate, openCall, setError],
  )
  const startCallFromComposer = useCallback(() => void handleStartCall(), [handleStartCall])

  const scrollToLatest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true })
    pinnedRef.current = true
    setPinned(true)
    setNewCount(0)
  }, [setPinned, setNewCount])

  // Clusters open at formation: every active member enters the room directly.
  // Introductions are an optional in-cluster checklist and never gate access.
  // Only a successful null means "not available" (RLS-filtered): a plain
  // error keeps the spinner instead of discarding room state for home.
  const clusterMissing = cluster.isSuccess && !cluster.data
  useFocusEffect(
    useCallback(() => {
      if (clusterMissing) {
        router.replace('/(app)/home')
      }
    }, [clusterMissing]),
  )

  if (!cluster.data && (cluster.isLoading || messages.isLoading)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.primary} />
      </SafeAreaView>
    )
  }

  if (!cluster.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: t.background }}>
      {/* Container-resize keyboard avoidance (Stream SDK approach): the whole
          screen is a KeyboardAvoidingView that pads its bottom by the keyboard
          height, so the composer footer rides up above the keyboard and the
          inverted list keeps its scroll position with no inset/scrollTo
          simulation. One native padding, no sticky translate to desync. */}
      <KeyboardAvoidingView behavior="padding" enabled={focused} keyboardVerticalOffset={0} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable
            accessibilityLabel="Back"
            onPress={() => {
              if (router.canGoBack()) router.back()
              else router.replace('/(app)/clusters')
            }}
            style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowLeft size={20} color={t.onSurface} strokeWidth={1.5} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.onSurface }} numberOfLines={1} maxFontSizeMultiplier={1.4} accessibilityRole="header">
              {cluster.data.name}
            </Text>
            <Text style={{ fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant }}>
              {onlineCount} of {memberCount} here
            </Text>
          </View>
          <ClusterMenu clusterId={clusterId} active="room" />
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <IntroChecklistBanner key={clusterId} clusterId={clusterId} />
        </View>

        {activeCall.data && !declinedCalls.has(activeCall.data.id) && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <View
              accessibilityLabel="Cluster call"
              style={{
                backgroundColor: t.surfaceContainer,
                borderWidth: 1,
                borderColor: t.primary,
                borderRadius: radii.xl,
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: t.primary,
                }}
              >
                <Phone size={16} color="#fff" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                  {joinedCall
                    ? 'You are in this call'
                    : activeCall.data.status === 'ringing'
                      ? `${memberMap.get(activeCall.data.initiated_by)?.display_name ?? 'A member'} started a call`
                      : 'A call is live'}
                </Text>
                <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                  {(callParticipants.data ?? []).length} in the call
                </Text>
              </View>
              <Pressable
                accessibilityLabel={joinedCall ? 'Return to call' : 'Join call'}
                onPress={() =>
                  joinedCall
                    ? openCall(activeCall.data!.id)
                    : void handleJoinCall(activeCall.data!.id)
                }
                disabled={callPending}
                style={{
                  backgroundColor: t.primary,
                  borderRadius: radii.pill,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  minHeight: 48,
                  justifyContent: 'center',
                  opacity: callPending ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>
                  {joinedCall ? 'Open' : 'Join'}
                </Text>
              </Pressable>
              {!joinedCall ? (
                <Pressable
                  accessibilityLabel="Decline call"
                  onPress={() =>
                    setDeclinedCalls((prev) => new Set(prev).add(activeCall.data!.id))
                  }
                  style={{ paddingHorizontal: 12, paddingVertical: 12, minHeight: 48, justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                    Decline
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}


        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View all members, ${onlineCount} of ${memberCount} here`}
            onPress={() => router.push({ pathname: '/cluster/[clusterId]/members', params: { clusterId } })}
            style={{
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.outlineVariant,
              borderRadius: radii.xl,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {(members.data ?? []).slice(0, 8).map((m) => {
                  const isMe = m.id === userId
                  const face = (
                    <View style={{ position: 'relative' }}>
                      <Avatar name={m.display_name} src={m.avatar_url} size={24} />
                      {online.has(m.id) || isMe ? (
                        <View
                          style={{
                            position: 'absolute',
                            bottom: -2,
                            right: -2,
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            borderWidth: 2,
                            borderColor: t.surface,
                            backgroundColor: scheme === 'dark' ? '#34d399' : '#10b981',
                          }}
                        />
                      ) : null}
                    </View>
                  )
                  // Own avatar gets a primary ring, mirroring web's
                  // `ring-2 ring-primary`. The -2 margin keeps the ring
                  // layout-neutral so the strip doesn't reshuffle.
                  return (
                    <View key={m.id}>
                      {isMe ? (
                        <View
                          style={{
                            borderWidth: 2,
                            borderColor: t.primary,
                            borderRadius: 14,
                            margin: -2,
                          }}
                        >
                          {face}
                        </View>
                      ) : (
                        face
                      )}
                    </View>
                  )
                })}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Users size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                  {onlineCount}/{memberCount}
                </Text>
                <ChevronRight size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
              </View>
            </View>
          </Pressable>
        </View>

        <View style={{ flex: 1 }}>
          {messages.isLoading || myMutes.isLoading ? (
            <View style={{ padding: 16 }}>
              <ActivityIndicator color={t.primary} />
            </View>
          ) : rows.length === 0 ? (
            <View style={{ margin: 16, padding: 32, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
                Nothing here yet. Say hello to your cluster.
              </Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={rows}
              keyExtractor={(r) => r.key}
              inverted
              keyboardShouldPersistTaps="handled"
              windowSize={11}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
              initialNumToRender={12}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
              onScroll={(e) => {
                const nearBottom = e.nativeEvent.contentOffset.y < 96
                pinnedRef.current = nearBottom
                setPinned(nearBottom)
                if (nearBottom) setNewCount(0)
              }}
              scrollEventThrottle={100}
              onEndReached={() => {
                if (hasMore && !loadEarlier.isPending) void handleLoadEarlier()
              }}
              onEndReachedThreshold={0.2}
              ListFooterComponent={
                hasMore ? (
                  <Pressable
                    onPress={() => void handleLoadEarlier()}
                    disabled={loadEarlier.isPending}
                    style={{
                      alignSelf: 'center',
                      borderWidth: 1,
                      borderColor: t.outlineVariant,
                      backgroundColor: t.surfaceLowest,
                      borderRadius: radii.pill,
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      minHeight: 48,
                      justifyContent: 'center',
                      marginVertical: 8,
                      opacity: loadEarlier.isPending ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                      {loadEarlier.isPending ? 'Loading earlier messages…' : 'Load earlier messages'}
                    </Text>
                  </Pressable>
                ) : null
              }
              renderItem={({ item: row }) => {
                const { item, showDay } = row
                if (item.kind === 'signal') {
                  const s = item.data
                  const signalMuted = isMutedAuthor(mutedSet, s.author_id)
                  if (signalMuted && !revealed.has(`signal-${s.id}`)) {
                    return (
                      <MutedPlaceholder
                        name={memberMap.get(s.author_id)?.display_name ?? 'Member'}
                        onToggle={() => toggleReveal(`signal-${s.id}`)}
                        kind="signal"
                      />
                    )
                  }
                  return (
                    <View style={{ gap: 8 }}>
                      {signalMuted ? (
                        <MutedHideBar
                          name={memberMap.get(s.author_id)?.display_name ?? 'Member'}
                          onToggle={() => toggleReveal(`signal-${s.id}`)}
                          kind="signal"
                        />
                      ) : null}
                      <SignalRow
                        signal={s}
                        author={memberMap.get(s.author_id)}
                        isMine={s.author_id === userId}
                        replyCount={replyCount.get(s.id) ?? 0}
                        clusterId={clusterId}
                        showDay={showDay}
                      />
                    </View>
                  )
                }
                if (item.kind === 'vote') {
                  const v = item.data
                  return (
                    <VoteRow
                      vote={v}
                      initiator={memberMap.get(v.initiated_by)}
                      target={v.target_member_id ? memberMap.get(v.target_member_id) : undefined}
                      isMine={v.initiated_by === userId}
                      clusterId={clusterId}
                      showDay={showDay}
                    />
                  )
                }
                const m = item.data
                const messageMuted = isMutedAuthor(mutedSet, m.author_id)
                if (messageMuted && !revealed.has(m.id)) {
                  return (
                    <MutedPlaceholder
                      name={memberMap.get(m.author_id)?.display_name ?? 'Member'}
                      onToggle={() => toggleReveal(m.id)}
                    />
                  )
                }
                return (
                  <View style={{ gap: 8 }}>
                    {messageMuted ? (
                      <MutedHideBar
                        name={memberMap.get(m.author_id)?.display_name ?? 'Member'}
                        onToggle={() => toggleReveal(m.id)}
                      />
                    ) : null}
                    <MessageItem
                    message={m}
                    mine={m.author_id === userId}
                    author={memberMap.get(m.author_id)}
                    clusterId={clusterId}
                    reactions={reactionsByMessage.get(m.id) ?? EMPTY_REACTIONS}
                    myReactionKeys={myReactionKeys}
                    members={parseMembers}
                    showDay={showDay}
                    isEditing={editingId === m.id}
                    editDraft={editDraft}
                    editPending={editMessage.isPending}
                    menuOpen={menuFor === m.id}
                    replyParent={replyParentMap.get(m.reply_to_id ?? '')}
                    onEditDraftChange={setEditDraft}
                    onSaveEdit={saveEdit}
                    onCancelEdit={cancelEdit}
                    onToggleMenu={handleToggleMenu}
                    onShowInfo={showInfo}
                    onEdit={startEdit}
                    onDelete={handleDeleteRequest}
                    onReply={startReply}
                    onReport={startReport}
                    onToggleReaction={handleToggleReaction}
                    />
                  </View>
                )
              }}
            />
          )}
          {typingMembers.length > 0 ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 4, gap: 4 }}>
              {typingMembers.map((m) => (
                <TypingBubble key={m.id} name={m.display_name} avatarUrl={m.avatar_url} userId={m.id} clusterId={clusterId} />
              ))}
            </View>
          ) : null}
          {!pinned && newCount > 0 ? (
            <Pressable
              accessibilityLabel={`Jump to ${newCount} new messages`}
              onPress={scrollToLatest}
              hitSlop={4}
              style={{
                position: 'absolute',
                bottom: 16,
                alignSelf: 'center',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: t.primary,
                borderRadius: radii.pill,
                paddingHorizontal: 20,
                paddingVertical: 12,
                minHeight: 48,
              }}
            >
              <ArrowDown size={16} color={t.onPrimary} strokeWidth={2} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onPrimary }}>
                {newCount} new message{newCount === 1 ? '' : 's'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Composer footer: plain flex child, lifted by the KAV padding. The tab
            bar owns the bottom inset below it. */}
        <View style={{ backgroundColor: t.background, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }}>
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
            onOpenSignal={openSignal}
            onStartCall={startCallFromComposer}
            callActive={Boolean(activeCall.data)}
            onCancelReply={cancelReply}
          />
        </View>

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
          seen={infoSeen}
          notSeen={infoNotSeen}
          clusterId={clusterId}
        />

        {reportFor ? (
          <ReportModal
            open
            onClose={() => setReportFor(null)}
            clusterId={clusterId}
            target={{
              id: reportFor.author_id,
              name: memberMap.get(reportFor.author_id)?.display_name ?? 'Member',
            }}
            messageId={reportFor.id}
          />
        ) : null}

        <Modal open={deleteFor !== null} onClose={() => { if (!deleteMessage.isPending) { setDeleteFor(null); setDeleteError(null) } }} title="Delete message?">
          <Text style={{ marginTop: 12, fontSize: 14, color: t.onSurfaceVariant }}>
            This removes your message from the cluster chat. This action can&apos;t be undone.
          </Text>
          {deleteError ? (
            <Text style={{ marginTop: 12, fontSize: 14, color: t.error }}>{deleteError}</Text>
          ) : null}
          <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Pressable
              onPress={() => {
                setDeleteFor(null)
                setDeleteError(null)
              }}
              disabled={deleteMessage.isPending}
              hitSlop={8}
              style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, justifyContent: 'center', opacity: deleteMessage.isPending ? 0.6 : 1 }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
            </Pressable>
            <PrimaryButton
              title="Delete"
              loadingTitle="Deleting…"
              loading={deleteMessage.isPending}
              onPress={() => deleteFor && void remove(deleteFor)}
            />
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

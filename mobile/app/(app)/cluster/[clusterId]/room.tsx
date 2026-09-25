import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
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
  useLeaveCall,
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
import { useDismissKeyboardOnBlur } from '../../../../src/lib/use-dismiss-keyboard-on-blur'
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

export default function RoomScreen() {
  const t = useTheme()
  const scheme = useResolvedScheme()
  const { bottom } = useSafeAreaInsets()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const authed = auth.state === 'signedIn'
  // Never fetch or subscribe before the session is restored: a pre-session
  // request fails RLS (permanent error, no retry) and a pre-session channel
  // receives nothing, leaving a push-tapped room stuck without its message.
  const authedClusterId = authed ? clusterId || null : null

  useClusterChannel(authedClusterId)
  useDismissKeyboardOnBlur()
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
  const queryClient = useQueryClient()
  const signals = useClusterSignals(authedClusterId)
  const signalReplies = useSignalReplies(authedClusterId, null)
  const votes = useClusterVotes(authedClusterId)
  const members = useClusterMembers(authedClusterId)
  const send = useSendMessage()
  const toggleReaction = useToggleReaction(clusterId || null)
  const editMessage = useEditMessage(clusterId || null)
  const deleteMessage = useDeleteMessage(clusterId || null)
  const raise = useRaiseSignal(clusterId || null)
  const markRead = useMarkClusterRead()
  const myMutes = useMyMutes(authedClusterId !== null)
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  function toggleReveal(id: string) {
    setRevealed((prev) => toggleRevealedId(prev, id))
  }
  const { typing, signalTyping, resetTyping, online } = usePresence(clusterId || null)
  const roomClusterId = authedClusterId
  const activeCall = useActiveCall(roomClusterId)
  const callParticipants = useCallParticipants(activeCall.data?.id ?? null)
  const startCall = useStartCall(roomClusterId)
  const joinCall = useJoinCall(roomClusterId)
  const leaveCall = useLeaveCall(roomClusterId)
  const joinedCall = (callParticipants.data ?? []).some((p) => p.user_id === userId)
  const callPending = startCall.isPending || joinCall.isPending || leaveCall.isPending

  const memberCount = (members.data ?? []).length
  const onlineCount = (members.data ?? []).filter((m) => online.has(m.id) || m.id === userId).length

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
  const [hasMore, setHasMore] = useState(false)
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
    // Same-route param change reuses the instance, so drop transient UI that
    // would otherwise leak from the previous cluster.
    setError(null)
    setEditingId(null)
    setEditDraft('')
    setMenuFor(null)
    setInfoFor(null)
    setReportFor(null)
    setDeleteFor(null)
    setDeleteError(null)
    setSignalOpen(false)
    setSignalPrompt('')
    setRevealed(new Set())
  }, [clusterId])

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
    if (!target || target.deleted_at) return undefined
    // Blank values bypass the ?? fallbacks in the quote box and would render
    // a textless white area. The schema allows blank display names and
    // whitespace-only content, so normalize them to the missing-target text.
    const rawName = memberMap.get(target.author_id)?.display_name
    const authorName = rawName && rawName.trim() ? rawName : 'Member'
    const rawPreview = target.content?.startsWith('gif:')
      ? 'GIF'
      : target.image_url
        ? 'Image'
        : (target.content ?? '')
    const preview = rawPreview.trim() ? rawPreview : 'message'
    return { authorName, preview }
  }

  function startReply(m: Message) {
    setMenuFor(null)
    setReplyTo(m)
  }

  const replyParentInfo = (() => {
    if (!replyTo) return null
    const info = replyPreview(replyTo)
    return info ? { id: replyTo.id, ...info } : null
  })()

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

  async function persistSend(content: string) {
    if (!clusterId) return
    await send.mutateAsync({ clusterId, content, replyToId: replyTo?.id ?? undefined })
    setReplyTo(null)
  }

  async function persistSendImage(image: PickedImage, caption: string | null) {
    if (!clusterId) return
    const path = await uploadChatImage(clusterId, image.uri, image.mime, image.width, image.height)
    try {
      await send.mutateAsync({ clusterId, content: caption, imageUrl: path, replyToId: replyTo?.id ?? undefined })
      setReplyTo(null)
    } catch (e) {
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
      lightHaptic()
    } catch (e) {
      errorHaptic()
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
    setInfoFor(m.id)
  }

  function startReport(m: Message) {
    setMenuFor(null)
    setReportFor(m)
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
    setDeleteError(null)
    try {
      await deleteMessage.mutateAsync(messageId)
      setDeleteFor(null)
    } catch (e) {
      setDeleteError(toErrorMessage(e, 'Could not delete your message.'))
    }
  }

  async function handleLoadEarlier() {
    setError(null)
    try {
      const result = await loadEarlier.mutateAsync()
      lastLenRef.current = (messages.data?.length ?? 0) + result.added
      if (!result.hasMore) {
        exhaustedRef.current = true
        setHasMore(false)
      }
    } catch (e) {
      setError(toErrorMessage(e, 'Could not load earlier messages.'))
    }
  }

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

  function openCall(callId: string, autoJoin = false) {
    router.push({
      pathname: '/cluster/[clusterId]/call',
      params: autoJoin ? { clusterId, callId, autoJoin: '1' } : { clusterId, callId },
    })
  }

  async function handleStartCall() {
    if (!clusterId) return
    setError(null)
    try {
      const callId = await startCall.mutateAsync()
      successHaptic()
      // The starter already chose to join: land directly in the call instead
      // of stopping at PreJoin. Joining another call still goes via PreJoin.
      openCall(callId, true)
    } catch (e) {
      errorHaptic()
      setError(toErrorMessage(e, 'Could not start the call. Try again.'))
    }
  }

  async function handleJoinCall(callId: string) {
    setError(null)
    try {
      await joinCall.mutateAsync(callId)
      successHaptic()
      openCall(callId)
    } catch (e) {
      errorHaptic()
      setError(toErrorMessage(e, 'Could not join the call. Try again.'))
    }
  }

  async function handleLeaveCall(callId: string) {
    setError(null)
    try {
      await leaveCall.mutateAsync(callId)
      successHaptic()
    } catch (e) {
      errorHaptic()
      setError(toErrorMessage(e, 'Could not leave the call. Try again.'))
    }
  }

  function scrollToLatest() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true })
    pinnedRef.current = true
    setPinned(true)
    setNewCount(0)
  }

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
      {/* Controller KeyboardAvoidingView (not RN's, whose JS-driven animation
          snaps on Android where keyboardWillShow never fires). Same layout
          semantics, frame-synced natively on both platforms. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable
            accessibilityLabel="Back"
            onPress={() => {
              // Deterministic parent, not history: with backBehavior="history"
              // a router.back() here could return to settings or signals if
              // that was the previous stop. The room always exits home.
              router.replace('/(app)/home')
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

        {activeCall.data && (
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
              {joinedCall ? (
                <Pressable
                  accessibilityLabel="Leave call"
                  onPress={() => void handleLeaveCall(activeCall.data!.id)}
                  disabled={leaveCall.isPending}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    minHeight: 48,
                    justifyContent: 'center',
                    opacity: leaveCall.isPending ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                    Leave
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
                    reactions={reactionsByMessage.get(m.id) ?? []}
                    myReactionKeys={myReactionKeys}
                    members={parseMembers}
                    showDay={showDay}
                    isEditing={editingId === m.id}
                    editDraft={editDraft}
                    editPending={editMessage.isPending}
                    menuOpen={menuFor === m.id}
                    replyParent={(() => {
                      const parent = replyById.get(m.reply_to_id ?? '')
                      if (parent && isMutedAuthor(mutedSet, parent.author_id)) return undefined
                      return replyPreview(parent)
                    })()}
                    onEditDraftChange={setEditDraft}
                    onSaveEdit={() => void saveEdit()}
                    onCancelEdit={() => setEditingId(null)}
                    onToggleMenu={() => setMenuFor(menuFor === m.id ? null : m.id)}
                    onShowInfo={showInfo}
                    onEdit={startEdit}
                    onDelete={(messageId) => {
                      setMenuFor(null)
                      setDeleteError(null)
                      setDeleteFor(messageId)
                    }}
                    onReply={startReply}
                    onReport={startReport}
                    onToggleReaction={(messageId, emoji) => void handleToggleReaction(messageId, emoji)}
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

        <View
          style={{
            backgroundColor: t.background,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 8 + bottom,
          }}
        >
          <Composer
            key={clusterId}
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
            onStartCall={() => void handleStartCall()}
            callActive={Boolean(activeCall.data)}
            onCancelReply={() => setReplyTo(null)}
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

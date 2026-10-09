import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, MessageSquare } from 'lucide-react-native'
import { useClusterMembers } from '../../../../../src/features/matching'
import { useCluster } from '../../../../../src/features/introductions'
import {
  useClusterSignals,
  useSignalReplies,
  useReplySignal,
  useSetSignalStatus,
  SIGNAL_STATUS_ORDER,
  type SignalStatus,
} from '../../../../../src/features/signals'
import { useAuth } from '../../../../../src/auth-context'
import { Avatar } from '../../../../../src/components/Avatar'
import { MutedHideBar, MutedPlaceholder } from '../../../../../src/components/MutedPlaceholder'
import { ClusterMenu, ClusterSectionHeader } from '../../../../../src/components/ClusterMenu'
import { ClusterThemeProvider, useClusterOnAccent } from '../../../../../src/lib/cluster-theme'
import { isMutedAuthor, mutedIds, toggleRevealedId, useMyMutes } from '../../../../../src/features/moderation'
import { useClusterChannel } from '../../../../../src/features/realtime'
import { dateTimeFormatter } from '../../../../../src/components/room/format'
import { radii } from '../../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../../src/lib/use-theme'
import { useDismissKeyboardOnBlur } from '../../../../../src/lib/use-dismiss-keyboard-on-blur'
import { Card, LoadingView, PrimaryButton, Screen } from '../../../../../src/components/ui'
import { CreatedPendingGate } from '../../../../../src/components/created/CreatedPendingGate'

const statusMeta: Record<SignalStatus, { label: string }> = {
  open: { label: 'Open' },
  in_progress: { label: 'In progress' },
  resolved: { label: 'Resolved' },
}

export default function SignalDetailScreen() {
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  return (
    <ClusterThemeProvider clusterId={clusterId || null}>
      <SignalDetailScreenContent />
    </ClusterThemeProvider>
  )
}

function SignalDetailScreenContent() {
  const t = useTheme()
  const onAccent = useClusterOnAccent() ?? t.onPrimary
  const { clusterId = '', signalId = '' } = useLocalSearchParams<{ clusterId: string; signalId: string }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const signals = useClusterSignals(clusterId || null)
  const replies = useSignalReplies(clusterId || null, signalId || null)
  const members = useClusterMembers(clusterId || null)
  const cluster = useCluster(clusterId || null)
  // Keep the thread live while watching: reply taps must not render stale.
  useClusterChannel(clusterId || null)
  const createdPending =
    cluster.data?.origin === 'created' &&
    (members.isPending || (members.data ?? []).length < 3) &&
    !members.isError
  const reply = useReplySignal(clusterId || null, signalId || null)
  const setStatus = useSetSignalStatus(clusterId || null)

  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [confirmResolve, setConfirmResolve] = useState(false)
  const myMutes = useMyMutes(clusterId !== '')
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [articleRevealed, setArticleRevealed] = useState(false)
  useDismissKeyboardOnBlur()

  // Same-route param change reuses the component instance, so reset
  // transient reply state for the new signal instead of showing the old draft.
  useEffect(() => {
    setDraft('')
    setError(null)
    setStatusError(null)
    setConfirmResolve(false)
    setRevealed(new Set())
    setArticleRevealed(false)
  }, [clusterId, signalId])
  function toggleReveal(id: string) {
    setRevealed((prev) => toggleRevealedId(prev, id))
  }

  const memberById = new Map((members.data ?? []).map((m) => [m.id, m]))
  const s = (signals.data ?? []).find((x) => x.id === signalId)
  const isRaiser = !!s && s.author_id === userId
  const raiser = s ? memberById.get(s.author_id) : undefined

  async function handleReply() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setError(null)
    setStatusError(null)
    try {
      await reply.mutateAsync(trimmed)
      setDraft('')
    } catch {
      setError('Something went wrong. Please try again.')
    }
  }

  async function handleStatus(next: SignalStatus) {
    if (!s) return
    setStatusError(null)
    setError(null)
    try {
      await setStatus.mutateAsync({ signalId: s.id, status: next })
      setConfirmResolve(false)
    } catch {
      setStatusError('Something went wrong updating the status.')
    }
  }

  if (signals.isLoading || replies.isLoading || members.isLoading || myMutes.isLoading || cluster.isLoading) {
    return (
      <Screen>
        <ClusterSectionHeader title="Signal" clusterId={clusterId} section="signals" />
        <LoadingView label="Loading signal…" />
      </Screen>
    )
  }

  if (createdPending) {
    return (
      <Screen>
        <ClusterSectionHeader title="Signal" clusterId={clusterId} section="signals" />
        <CreatedPendingGate
          clusterId={clusterId}
          confirmedCount={(members.data ?? []).length}
          loading={members.isPending}
        />
      </Screen>
    )
  }

  if (!s) {
    return (
      <Screen>
        <ClusterSectionHeader title="Signal" clusterId={clusterId} section="signals" />
        <Card plain>
          <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
            This signal isn’t available.
          </Text>
        </Card>
      </Screen>
    )
  }

  const nextStatus = SIGNAL_STATUS_ORDER[SIGNAL_STATUS_ORDER.indexOf(s.status) + 1] ?? null
  const meta = statusMeta[s.status]

  return (
    <Screen avoiding>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back()
            else router.replace({ pathname: '/cluster/[clusterId]/signals', params: { clusterId } })
          }}
          accessibilityRole="button"
          accessibilityLabel="Back to signals"
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, minHeight: 44 }}
        >
          <ArrowLeft size={16} color={t.primary} strokeWidth={1.5} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: t.primary }}>Signals</Text>
        </Pressable>
        <ClusterMenu clusterId={clusterId} active="signals" />
      </View>

      {isMutedAuthor(mutedSet, s.author_id) && !articleRevealed ? (
        <MutedPlaceholder
          name={memberById.get(s.author_id)?.display_name ?? 'Member'}
          onToggle={() => setArticleRevealed(true)}
          kind="signal"
        />
      ) : (
        <View style={{ gap: 8 }}>
          {isMutedAuthor(mutedSet, s.author_id) ? (
            <MutedHideBar
              name={memberById.get(s.author_id)?.display_name ?? 'Member'}
              onToggle={() => setArticleRevealed(false)}
              kind="signal"
            />
          ) : null}
          <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar name={raiser?.display_name ?? 'Member'} src={raiser?.avatar_url} size={24} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface, flexShrink: 1 }} numberOfLines={1}>
              {raiser?.display_name ?? 'Member'}
            </Text>
            {isRaiser ? (
              <Text style={{ fontSize: 12, color: t.onSurfaceVariant, flexShrink: 0 }}>(you)</Text>
            ) : null}
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant, flexShrink: 0 }}>
              · {dateTimeFormatter.format(new Date(s.created_at))}
            </Text>
            <View style={{ marginLeft: 'auto', backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 2, flexShrink: 0 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: t.primary }}>{meta.label}</Text>
            </View>
          </View>
          <Text style={{ marginTop: 8, fontSize: 20, lineHeight: 28, fontWeight: '600', color: t.onSurface }}>
            {s.prompt}
          </Text>
          {s.resolved_at ? (
            <Text style={{ marginTop: 8, fontSize: 12, color: t.onSurfaceVariant }}>
              Resolved {dateTimeFormatter.format(new Date(s.resolved_at))}
              {s.resolved_by ? ` by ${memberById.get(s.resolved_by)?.display_name ?? 'a member'}` : ''}
            </Text>
          ) : null}

          {isRaiser && nextStatus ? (
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: t.surfaceContainer, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {nextStatus === 'resolved' && confirmResolve ? (
                <>
                  <PrimaryButton
                    title="Confirm resolve"
                    loading={setStatus.isPending}
                    onPress={() => void handleStatus('resolved')}
                  />
                  <Pressable
                    onPress={() => {
                      setConfirmResolve(false)
                      setStatusError(null)
                    }}
                    disabled={setStatus.isPending}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel resolving signal"
                    style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center', opacity: setStatus.isPending ? 0.6 : 1 }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                      Cancel
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => {
                    if (nextStatus === 'resolved') {
                      setStatusError(null)
                      setConfirmResolve(true)
                    } else void handleStatus(nextStatus)
                  }}
                  disabled={setStatus.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={nextStatus === 'in_progress' ? 'Mark signal in progress' : 'Mark signal resolved'}
                  accessibilityState={{ disabled: setStatus.isPending }}
                  style={{
                    borderWidth: nextStatus === 'resolved' ? 1 : 0,
                    borderColor: t.error,
                    backgroundColor: nextStatus === 'resolved' ? 'transparent' : t.primary,
                    borderRadius: radii.pill,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    minHeight: 48,
                    justifyContent: 'center',
                    opacity: setStatus.isPending ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: nextStatus === 'resolved' ? t.error : onAccent,
                    }}
                  >
                    {nextStatus === 'in_progress' ? 'Mark in progress' : 'Mark resolved'}
                  </Text>
                </Pressable>
              )}
              {statusError ? (
                <Text style={{ fontSize: 12, color: t.error }}>{statusError}</Text>
              ) : null}
            </View>
          ) : null}
        </Card>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 4 }}>
        <MessageSquare size={20} color={t.onSurface} strokeWidth={2} />
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.onSurface }}>
          {replies.data?.length ?? 0} {replies.data?.length === 1 ? 'reply' : 'replies'}
        </Text>
      </View>

      {(replies.data ?? []).length === 0 ? (
        <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
          No replies yet. Offer a hand below.
        </Text>
      ) : (
        <View>
          {(replies.data ?? []).map((r, index) => {
            const rMuted = isMutedAuthor(mutedSet, r.author_id)
            const isLast = index === (replies.data ?? []).length - 1
            if (rMuted && !revealed.has(r.id)) {
              return (
                <View
                  key={r.id}
                  style={{
                    paddingVertical: 12,
                    borderBottomWidth: isLast ? 0 : 1,
                    borderBottomColor: t.outlineVariant,
                  }}
                >
                  <MutedPlaceholder
                    name={memberById.get(r.author_id)?.display_name ?? 'Member'}
                    onToggle={() => toggleReveal(r.id)}
                  />
                </View>
              )
            }
            return (
              <View
                key={r.id}
                style={{
                  paddingVertical: 14,
                  borderBottomWidth: isLast ? 0 : 1,
                  borderBottomColor: t.outlineVariant,
                }}
              >
                {rMuted ? (
                  <View style={{ marginBottom: 8 }}>
                    <MutedHideBar
                      name={memberById.get(r.author_id)?.display_name ?? 'Member'}
                      onToggle={() => toggleReveal(r.id)}
                    />
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Avatar
                    name={memberById.get(r.author_id)?.display_name ?? 'Member'}
                    src={memberById.get(r.author_id)?.avatar_url}
                    size={32}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                        {memberById.get(r.author_id)?.display_name ?? 'Member'}
                      </Text>
                      <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                        · {dateTimeFormatter.format(new Date(r.created_at))}
                      </Text>
                    </View>
                    <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 22, color: t.onSurface }}>
                      {r.content}
                    </Text>
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      )}

      <View style={{ marginTop: 16 }}>
        <Card>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            maxLength={2000}
            multiline
            placeholder="Offer a hand or share a thought…"
            accessibilityLabel="Reply to this signal"
            placeholderTextColor={t.onSurfaceVariant}
            style={{
              backgroundColor: t.surfaceContainer,
              borderWidth: 1,
              borderColor: t.outlineVariant,
              borderRadius: radii.md,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 14,
              lineHeight: 22,
              minHeight: 76,
              textAlignVertical: 'top',
              color: t.onSurface,
            }}
          />
          <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>{draft.length}/2000</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {error ? <Text style={{ fontSize: 12, color: t.error }}>{error}</Text> : null}
              <PrimaryButton
                title="Reply"
                loadingTitle="Sending…"
                loading={reply.isPending}
                onPress={() => void handleReply()}
              />
            </View>
          </View>
        </Card>
      </View>
    </Screen>
  )
}

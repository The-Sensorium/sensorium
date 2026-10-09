import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { ChevronDown, MessageSquare, Plus } from 'lucide-react-native'
import { useClusterMembers } from '../../../../src/features/matching'
import { useCluster } from '../../../../src/features/introductions'
import { useClusterSignals, useSignalReplies, useRaiseSignal, type Signal, type SignalStatus } from '../../../../src/features/signals'
import { useAuth } from '../../../../src/auth-context'
import { Avatar } from '../../../../src/components/Avatar'
import { ClusterSectionHeader } from '../../../../src/components/ClusterMenu'
import { ClusterThemeProvider, useClusterOnAccent } from '../../../../src/lib/cluster-theme'
import { RaiseSignalModal } from '../../../../src/components/room/RaiseSignalModal'
import { isMutedAuthor, mutedIds, toggleRevealedId, useMyMutes } from '../../../../src/features/moderation'
import { useClusterChannel } from '../../../../src/features/realtime'
import { MutedHideBar, MutedPlaceholder } from '../../../../src/components/MutedPlaceholder'
import { dateTimeFormatter } from '../../../../src/components/room/format'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { Card, ErrorText, LoadingView, Screen } from '../../../../src/components/ui'
import { CreatedPendingGate } from '../../../../src/components/created/CreatedPendingGate'
import { usePullToRefresh } from '../../../../src/lib/use-pull-to-refresh'

const statusMeta: Record<SignalStatus, { label: string; colorKey: 'primary' | 'tertiary' | 'onSurfaceVariant' }> = {
  open: { label: 'Open', colorKey: 'primary' },
  in_progress: { label: 'In progress', colorKey: 'tertiary' },
  resolved: { label: 'Resolved', colorKey: 'onSurfaceVariant' },
}

export default function SignalsScreen() {
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  return (
    <ClusterThemeProvider clusterId={clusterId || null}>
      <SignalsScreenContent />
    </ClusterThemeProvider>
  )
}

function SignalsScreenContent() {
  const t = useTheme()
  const onAccent = useClusterOnAccent() ?? t.onPrimary
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const signals = useClusterSignals(clusterId || null)
  const replies = useSignalReplies(clusterId || null, null)
  const members = useClusterMembers(clusterId || null)
  const cluster = useCluster(clusterId || null)
  // Keep the list live while watching: signal_new taps must not render stale.
  useClusterChannel(clusterId || null)
  const raise = useRaiseSignal(clusterId || null)

  const [modalOpen, setModalOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const myMutes = useMyMutes(clusterId !== '')
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const pull = usePullToRefresh([
    () => signals.refetch(),
    () => replies.refetch(),
    () => members.refetch(),
    () => myMutes.refetch(),
  ])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  function toggleReveal(id: string) {
    setRevealed((prev) => toggleRevealedId(prev, id))
  }

  const memberById = new Map((members.data ?? []).map((m) => [m.id, m]))
  const replyCount = new Map<string, number>()
  for (const r of replies.data ?? []) {
    replyCount.set(r.signal_id, (replyCount.get(r.signal_id) ?? 0) + 1)
  }

  const active = (signals.data ?? []).filter((s) => s.status !== 'resolved')
  const resolved = (signals.data ?? []).filter((s) => s.status === 'resolved')

  async function handleRaise() {
    const trimmed = prompt.trim()
    if (!trimmed) return
    setError(null)
    try {
      await raise.mutateAsync(trimmed)
      setModalOpen(false)
      setPrompt('')
    } catch {
      setError('Something went wrong. Please try again.')
    }
  }

  return (
    <Screen onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      <ClusterSectionHeader title="Signals" clusterId={clusterId} section="signals" />
      <ErrorText message={pull.error} />
      {cluster.data?.origin === 'created' && (members.isPending || (members.data ?? []).length < 3) && !members.isError ? (
        <CreatedPendingGate clusterId={clusterId} confirmedCount={(members.data ?? []).length} loading={members.isPending} />
      ) : (
      <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
          Raise a signal when you need help or a hand.
        </Text>
        <Pressable
          onPress={() => setModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Raise a signal"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.primary, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 8, minHeight: 44, justifyContent: 'center', flexShrink: 0 }}
        >
          <Plus size={16} color={onAccent} strokeWidth={2} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: onAccent }}>Raise</Text>
        </Pressable>
      </View>

      {signals.isLoading || myMutes.isLoading ? (
        <LoadingView label="Loading signals…" />
      ) : active.length === 0 && resolved.length === 0 ? (
        <Card plain>
          <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
            No signals yet. Need help with something? Raise the first signal.
          </Text>
        </Card>
      ) : (
        <>
          {active.map((s) => {
            const sMuted = isMutedAuthor(mutedSet, s.author_id)
            if (sMuted && !revealed.has(s.id)) {
              return (
                <MutedPlaceholder
                  key={s.id}
                  name={memberById.get(s.author_id)?.display_name ?? 'Member'}
                  onToggle={() => toggleReveal(s.id)}
                  kind="signal"
                />
              )
            }
            return (
              <View key={s.id} style={{ gap: 8 }}>
                {sMuted ? (
                  <MutedHideBar
                    name={memberById.get(s.author_id)?.display_name ?? 'Member'}
                    onToggle={() => toggleReveal(s.id)}
                    kind="signal"
                  />
                ) : null}
                <SignalCard
                  signal={s}
                  clusterId={clusterId}
                  memberById={memberById}
                  replyCount={replyCount.get(s.id) ?? 0}
                  isMine={s.author_id === userId}
                />
              </View>
            )
          })}
          {resolved.length > 0 ? (
            <Card>
              <Pressable
                onPress={() => setShowResolved((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showResolved ? 'Hide resolved signals' : `Show resolved signals, ${resolved.length}`}
                accessibilityState={{ expanded: showResolved }}
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 48 }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurfaceVariant }}>
                  Resolved ({resolved.length})
                </Text>
                <View style={{ transform: [{ rotate: showResolved ? '180deg' : '0deg' }] }}>
                  <ChevronDown size={16} color={t.onSurfaceVariant} strokeWidth={2} />
                </View>
              </Pressable>
              {showResolved ? (
                <View style={{ marginTop: 12, gap: 12 }}>
                  {resolved.map((s) => {
                    const sMuted = isMutedAuthor(mutedSet, s.author_id)
                    if (sMuted && !revealed.has(s.id)) {
                      return (
                        <MutedPlaceholder
                          key={s.id}
                          name={memberById.get(s.author_id)?.display_name ?? 'Member'}
                          onToggle={() => toggleReveal(s.id)}
                          kind="signal"
                        />
                      )
                    }
                    return (
                      <View key={s.id} style={{ gap: 8 }}>
                        {sMuted ? (
                          <MutedHideBar
                            name={memberById.get(s.author_id)?.display_name ?? 'Member'}
                            onToggle={() => toggleReveal(s.id)}
                            kind="signal"
                          />
                        ) : null}
                        <SignalCard
                          signal={s}
                          clusterId={clusterId}
                          memberById={memberById}
                          replyCount={replyCount.get(s.id) ?? 0}
                          isMine={s.author_id === userId}
                          compact
                        />
                      </View>
                    )
                  })}
                </View>
              ) : null}
            </Card>
          ) : null}
        </>
      )}
      </>
      )}

      <RaiseSignalModal
        open={modalOpen}
        error={error}
        prompt={prompt}
        pending={raise.isPending}
        onPromptChange={setPrompt}
        onClose={() => setModalOpen(false)}
        onRaise={() => void handleRaise()}
      />
      {raise.isPending ? <ActivityIndicator size="small" color={t.primary} /> : null}
    </Screen>
  )
}

function SignalCard({
  signal,
  clusterId,
  memberById,
  replyCount,
  isMine,
  compact = false,
}: {
  signal: Signal
  clusterId: string
  memberById: Map<string, { display_name: string; avatar_url: string | null }>
  replyCount: number
  isMine: boolean
  compact?: boolean
}) {
  const t = useTheme()
  const meta = statusMeta[signal.status]
  const author = memberById.get(signal.author_id)
  return (
    <Link
      href={{ pathname: '/cluster/[clusterId]/signals/[signalId]', params: { clusterId, signalId: signal.id } }}
      asChild
    >
      <Pressable
        style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: compact ? 12 : 16, marginBottom: 12 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar name={author?.display_name ?? 'Member'} src={author?.avatar_url} size={24} />
          <Text style={{ fontSize: 14, fontWeight: '500', color: t.onSurface, flexShrink: 1 }} numberOfLines={1}>
            {author?.display_name ?? 'Member'}
          </Text>
          {isMine ? (
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant, flexShrink: 0 }}>(you)</Text>
          ) : null}
          <Text style={{ fontSize: 12, color: t.onSurfaceVariant, flexShrink: 0 }}>
            · {dateTimeFormatter.format(new Date(signal.created_at))}
          </Text>
          <View style={{ marginLeft: 'auto', backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 2, flexShrink: 0 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: t[meta.colorKey] }}>{meta.label}</Text>
          </View>
        </View>
        <Text style={{ marginTop: 6, fontSize: 15, lineHeight: 22, color: t.onSurface }} numberOfLines={compact ? 2 : undefined}>
          {signal.prompt}
        </Text>
        <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MessageSquare size={20} color={t.onSurfaceVariant} strokeWidth={2} />
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </Text>
        </View>
      </Pressable>
    </Link>
  )
}

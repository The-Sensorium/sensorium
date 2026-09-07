import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { ChevronDown, MessageSquare, Plus } from 'lucide-react-native'
import { useClusterMembers } from '../../../../src/features/matching'
import { useClusterSignals, useSignalReplies, useRaiseSignal, type Signal, type SignalStatus } from '../../../../src/features/signals'
import { useAuth } from '../../../../src/auth-context'
import { Avatar } from '../../../../src/components/Avatar'
import { MutedPlaceholder } from '../../../../src/components/MutedPlaceholder'
import { ClusterSectionHeader } from '../../../../src/components/ClusterMenu'
import { RaiseSignalModal } from '../../../../src/components/room/RaiseSignalModal'
import { isMutedAuthor, mutedIds, useMyMutes } from '../../../../src/features/moderation'
import { dateTimeFormatter } from '../../../../src/components/room/format'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { Card, LoadingView, Screen } from '../../../../src/components/ui'

const statusMeta: Record<SignalStatus, { label: string; colorKey: 'primary' | 'tertiary' | 'onSurfaceVariant' }> = {
  open: { label: 'Open', colorKey: 'primary' },
  in_progress: { label: 'In progress', colorKey: 'tertiary' },
  resolved: { label: 'Resolved', colorKey: 'onSurfaceVariant' },
}

export default function SignalsScreen() {
  const t = useTheme()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const signals = useClusterSignals(clusterId || null)
  const replies = useSignalReplies(clusterId || null, null)
  const members = useClusterMembers(clusterId || null)
  const raise = useRaiseSignal(clusterId || null)

  const [modalOpen, setModalOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const myMutes = useMyMutes(clusterId !== '')
  const mutedSet = useMemo(() => mutedIds(myMutes.data), [myMutes.data])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  function reveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
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
    <Screen>
      <ClusterSectionHeader title="Signals" clusterId={clusterId} section="signals" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>Signals</Text>
          <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
            Raise a signal when you need help or a hand.
          </Text>
        </View>
        <Pressable
          onPress={() => setModalOpen(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.primary, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <Plus size={16} color={t.onPrimary} strokeWidth={2} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onPrimary }}>Raise</Text>
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
          {active.map((s) =>
            isMutedAuthor(mutedSet, s.author_id) && !revealed.has(s.id) ? (
              <MutedPlaceholder
                key={s.id}
                name={memberById.get(s.author_id)?.display_name ?? 'Member'}
                onToggle={() => reveal(s.id)}
              />
            ) : (
              <SignalCard
                key={s.id}
                signal={s}
                clusterId={clusterId}
                memberById={memberById}
                replyCount={replyCount.get(s.id) ?? 0}
                isMine={s.author_id === userId}
              />
            ),
          )}
          {resolved.length > 0 ? (
            <Card>
              <Pressable
                onPress={() => setShowResolved((v) => !v)}
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
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
                  {resolved.map((s) =>
                    isMutedAuthor(mutedSet, s.author_id) && !revealed.has(s.id) ? (
                      <MutedPlaceholder
                        key={s.id}
                        name={memberById.get(s.author_id)?.display_name ?? 'Member'}
                        onToggle={() => reveal(s.id)}
                      />
                    ) : (
                      <SignalCard
                        key={s.id}
                        signal={s}
                        clusterId={clusterId}
                        memberById={memberById}
                        replyCount={replyCount.get(s.id) ?? 0}
                        isMine={s.author_id === userId}
                        compact
                      />
                    ),
                  )}
                </View>
              ) : null}
            </Card>
          ) : null}
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
        style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, padding: compact ? 16 : 20, marginBottom: 12 }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Avatar name={author?.display_name ?? 'Member'} src={author?.avatar_url} size={20} />
          <Text style={{ fontSize: 14, fontWeight: '500', color: t.onSurface }}>
            {author?.display_name ?? 'Member'}
          </Text>
          {isMine ? (
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>(you)</Text>
          ) : null}
          <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
            · {dateTimeFormatter.format(new Date(signal.created_at))}
          </Text>
          <View style={{ marginLeft: 'auto', backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '500', color: t[meta.colorKey] }}>{meta.label}</Text>
          </View>
        </View>
        <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: t.onSurface }} numberOfLines={compact ? 2 : undefined}>
          {signal.prompt}
        </Text>
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <MessageSquare size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
          <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </Text>
        </View>
      </Pressable>
    </Link>
  )
}

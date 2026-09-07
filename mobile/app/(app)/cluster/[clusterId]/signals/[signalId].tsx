import { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, MessageSquare } from 'lucide-react-native'
import { useClusterMembers } from '../../../../../src/features/matching'
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
import { MutedPlaceholder } from '../../../../../src/components/MutedPlaceholder'
import { ClusterMenu, ClusterSectionHeader } from '../../../../../src/components/ClusterMenu'
import { isMutedAuthor, mutedIds, useMyMutes } from '../../../../../src/features/moderation'
import { dateTimeFormatter } from '../../../../../src/components/room/format'
import { radii } from '../../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../../src/lib/use-theme'
import { Card, LoadingView, PrimaryButton, Screen } from '../../../../../src/components/ui'

const statusMeta: Record<SignalStatus, { label: string }> = {
  open: { label: 'Open' },
  in_progress: { label: 'In progress' },
  resolved: { label: 'Resolved' },
}

export default function SignalDetailScreen() {
  const t = useTheme()
  const { clusterId = '', signalId = '' } = useLocalSearchParams<{ clusterId: string; signalId: string }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const signals = useClusterSignals(clusterId || null)
  const replies = useSignalReplies(clusterId || null, signalId || null)
  const members = useClusterMembers(clusterId || null)
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
  function reveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
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

  if (signals.isLoading || replies.isLoading || members.isLoading || myMutes.isLoading) {
    return (
      <Screen>
        <ClusterSectionHeader title="Signal" clusterId={clusterId} section="signals" />
        <LoadingView label="Loading signal…" />
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
          onPress={() => router.back()}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeft size={16} color={t.primary} strokeWidth={1.5} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>Back</Text>
        </Pressable>
        <ClusterMenu clusterId={clusterId} active="signals" />
      </View>

      {isMutedAuthor(mutedSet, s.author_id) && !articleRevealed ? (
        <MutedPlaceholder
          name={memberById.get(s.author_id)?.display_name ?? 'Member'}
          onToggle={() => setArticleRevealed(true)}
        />
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Avatar name={raiser?.display_name ?? 'Member'} src={raiser?.avatar_url} size={24} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
              {raiser?.display_name ?? 'Member'}
            </Text>
            {isRaiser ? (
              <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>(you)</Text>
            ) : null}
            <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
              · {dateTimeFormatter.format(new Date(s.created_at))}
            </Text>
            <View style={{ marginLeft: 'auto', backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: t.primary }}>{meta.label}</Text>
            </View>
          </View>
          <Text style={{ marginTop: 12, fontSize: 20, fontWeight: '600', color: t.onSurface }}>
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
                    style={{ paddingHorizontal: 16, paddingVertical: 10, opacity: setStatus.isPending ? 0.6 : 1 }}
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
                  style={{
                    borderWidth: nextStatus === 'resolved' ? 1 : 0,
                    borderColor: t.error,
                    backgroundColor: nextStatus === 'resolved' ? 'transparent' : t.primary,
                    borderRadius: radii.pill,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    opacity: setStatus.isPending ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: nextStatus === 'resolved' ? t.error : t.onPrimary,
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
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 12 }}>
        <MessageSquare size={16} color={t.onSurface} strokeWidth={1.5} />
        <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>
          {replies.data?.length ?? 0} {replies.data?.length === 1 ? 'reply' : 'replies'}
        </Text>
      </View>

      {(replies.data ?? []).length === 0 ? (
        <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
          No replies yet. Offer a hand below.
        </Text>
      ) : (
        (replies.data ?? []).map((r) =>
          isMutedAuthor(mutedSet, r.author_id) && !revealed.has(r.id) ? (
            <MutedPlaceholder
              key={r.id}
              name={memberById.get(r.author_id)?.display_name ?? 'Member'}
              onToggle={() => reveal(r.id)}
            />
          ) : (
            <Card key={r.id}>
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Avatar
                    name={memberById.get(r.author_id)?.display_name ?? 'Member'}
                    src={memberById.get(r.author_id)?.avatar_url}
                    size={20}
                  />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                    {memberById.get(r.author_id)?.display_name ?? 'Member'}
                  </Text>
                  <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                    · {dateTimeFormatter.format(new Date(r.created_at))}
                  </Text>
                </View>
                <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: t.onSurface }}>
                  {r.content}
                </Text>
              </View>
            </Card>
          ),
        )
      )}

      <Card>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          maxLength={2000}
          multiline
          numberOfLines={3}
            placeholder="Offer a hand or share a thought…"
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
            minHeight: 88,
            textAlignVertical: 'top',
            color: t.onSurface,
          }}
        />
        <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
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
    </Screen>
  )
}

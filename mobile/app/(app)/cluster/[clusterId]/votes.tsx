import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ArrowRight, Hourglass, ThumbsDown, ThumbsUp } from 'lucide-react-native'
import { useAuth } from '../../../../src/auth-context'
import { useClusterMembers } from '../../../../src/features/matching'
import {
  useClusterVotes,
  useVoteCounts,
  useReplacementRound,
  useStartReplaceVote,
  useStartNameVote,
  useVoteOn,
  parseVoteResult,
  type ReplacementRound,
  type Vote as VoteRow,
} from '../../../../src/features/votes'
import { Modal } from '../../../../src/components/Modal'
import { Avatar } from '../../../../src/components/Avatar'
import { CountdownTimer } from '../../../../src/components/CountdownTimer'
import { ClusterSectionHeader } from '../../../../src/components/ClusterMenu'
import { toErrorMessage } from '../../../../src/lib/error'
import { radii } from '../../../../src/lib/theme-tokens'
import { useTheme } from '../../../../src/lib/use-theme'
import { useResolvedScheme } from '../../../../src/lib/theme-choice'
import { Card, ErrorText, LoadingView, PrimaryButton, Screen } from '../../../../src/components/ui'
import { usePullToRefresh } from '../../../../src/lib/use-pull-to-refresh'

type MemberCard = { id: string; display_name: string; avatar_url: string | null }
type GovernableVoteType = Exclude<VoteRow['type'], 'select_candidate'>

const VOTE_TYPE_LABEL: Record<GovernableVoteType, string> = {
  replace_member: 'Replace member',
  change_name: 'Rename cluster',
}

// Emerald yes-tally matching web (text-emerald-700/300); split by scheme so
// 12px text holds contrast on both themes.
const YES_TALLY = { light: '#047857', dark: '#6ee7b7' }

export default function VotesScreen() {
  const t = useTheme()
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const votes = useClusterVotes(clusterId || null)
  const counts = useVoteCounts(clusterId || null)
  const round = useReplacementRound(clusterId || null)
  const members = useClusterMembers(clusterId || null)

  const startReplace = useStartReplaceVote(clusterId || null)
  const startName = useStartNameVote(clusterId || null)
  const voteOn = useVoteOn(clusterId || null)

  const [modal, setModal] = useState<'replace' | 'name' | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [nameSuggestion, setNameSuggestion] = useState('')
  const [pendingVoteId, setPendingVoteId] = useState<string | null>(null)
  const [voteError, setVoteError] = useState<string | null>(null)
  const pull = usePullToRefresh([
    () => votes.refetch(),
    () => counts.refetch(),
    () => round.refetch(),
    () => members.refetch(),
  ])

  const memberById = useMemo(
    () =>
      new Map(
        (members.data ?? []).map((m) => [
          m.id,
          { id: m.id, display_name: m.display_name, avatar_url: m.avatar_url } satisfies MemberCard,
        ]),
      ),
    [members.data],
  )

  const myChoiceByVote = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of counts.data ?? []) {
      if (r.my_choice) map.set(r.vote_id, r.my_choice)
    }
    return map
  }, [counts.data])

  const quorum = Math.floor((members.data ?? []).length / 2) + 1
  const castCountByVote = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of counts.data ?? []) map.set(r.vote_id, r.cast_count)
    return map
  }, [counts.data])

  async function castVote(voteId: string, choice: string) {
    setVoteError(null)
    setPendingVoteId(voteId)
    try {
      await voteOn.mutateAsync({ voteId, choice })
    } catch (err) {
      setVoteError(toErrorMessage(err, 'Could not cast your vote'))
    } finally {
      setPendingVoteId(null)
    }
  }

  async function confirmReplace() {
    if (!targetId) return
    setVoteError(null)
    try {
      await startReplace.mutateAsync(targetId)
      setModal(null)
      setTargetId(null)
    } catch (err) {
      setVoteError(toErrorMessage(err, 'Could not start the vote'))
    }
  }

  async function confirmName() {
    const name = nameSuggestion.trim()
    if (!name) return
    setVoteError(null)
    try {
      await startName.mutateAsync(name)
      setModal(null)
      setNameSuggestion('')
    } catch (err) {
      setVoteError(toErrorMessage(err, 'Could not start the vote'))
    }
  }

  if (votes.isLoading || counts.isLoading || members.isLoading) {
    return (
      <Screen>
        <ClusterSectionHeader title="Votes" clusterId={clusterId} section="votes" />
        <LoadingView label="Loading votes…" />
      </Screen>
    )
  }

  const openVotes = (votes.data ?? []).filter((v) => v.status === 'open' && v.type !== 'select_candidate')
  const closedVotes = (votes.data ?? []).filter((v) => v.status === 'closed' && v.type !== 'select_candidate')

  return (
    <Screen onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      <ClusterSectionHeader title="Votes" clusterId={clusterId} section="votes" />
      <ErrorText message={pull.error} />
      {voteError ? (
        <Card>
          <Text style={{ fontSize: 14, color: t.error }}>{voteError}</Text>
        </Card>
      ) : null}

      <Card>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface }}>
            Govern the cluster
          </Text>
          <Text style={{ marginTop: 2, fontSize: 14, color: t.onSurfaceVariant }}>
            Any member can start a community vote. Results are hidden until it closes.
          </Text>
          <View style={{ marginTop: 16, gap: 8 }}>
            <Pressable
              onPress={() => setModal('replace')}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 12 }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                Replace a member
              </Text>
              <ArrowRight size={16} color={t.onSurface} />
            </Pressable>
            <Pressable
              onPress={() => setModal('name')}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 12 }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                Suggest a cluster name
              </Text>
              <ArrowRight size={16} color={t.onSurface} />
            </Pressable>
          </View>
        </View>
      </Card>

      {round.data ? (
        <ReplacementBanner
          round={round.data}
          memberById={memberById}
        />
      ) : null}

      <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface, marginTop: 20, marginBottom: 12 }}>
        Active votes
      </Text>
      {openVotes.length === 0 ? (
        <Card plain>
          <Text style={{ fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
            No open votes right now.
          </Text>
        </Card>
      ) : (
        openVotes.map((vote) => (
          <ActiveVoteCard
            key={vote.id}
            vote={vote}
            myChoice={myChoiceByVote.get(vote.id) ?? null}
            memberById={memberById}
            pending={pendingVoteId === vote.id}
            onVote={castVote}
            castCount={castCountByVote.get(vote.id) ?? 0}
            quorum={quorum}
          />
        ))
      )}

      {closedVotes.length > 0 ? (
        <>
          <Text style={{ fontSize: 18, fontWeight: '600', color: t.onSurface, marginTop: 20, marginBottom: 12 }}>
            Past votes
          </Text>
          {closedVotes.map((vote) => (
            <PastVoteCard
              key={vote.id}
              vote={vote}
              memberById={memberById}
              castCount={castCountByVote.get(vote.id) ?? 0}
            />
          ))}
        </>
      ) : null}

      <Modal open={modal === 'replace'} onClose={() => setModal(null)} title="Replace a member">
        <View style={{ marginTop: 12, gap: 12 }}>
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
            Pick who you’d like to put up for a community vote. Passing starts a replacement search.
          </Text>
          {(members.data ?? [])
            .filter((m) => m.id !== userId)
            .map((m) => {
              const active = targetId === m.id
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setTargetId(m.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderWidth: 1,
                    borderColor: active ? t.primary : t.outlineVariant,
                    backgroundColor: active ? t.surfaceContainer : 'transparent',
                    borderRadius: radii.md,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <Avatar name={m.display_name} src={m.avatar_url} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                      {m.display_name}
                    </Text>
                    <Text style={{ fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1}>
                      {m.current_status || 'Cluster member'}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          <PrimaryButton
            title="Start replacement vote"
            loadingTitle="Starting…"
            loading={startReplace.isPending}
            onPress={() => void confirmReplace()}
          />
        </View>
      </Modal>

      <Modal open={modal === 'name'} onClose={() => setModal(null)} title="Suggest a cluster name">
        <View style={{ marginTop: 12, gap: 12 }}>
          <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
            Propose a new name for this cluster. Passing renames it for everyone.
          </Text>
          <TextInput
            value={nameSuggestion}
            onChangeText={setNameSuggestion}
            maxLength={60}
            placeholder="New cluster name"
            placeholderTextColor={t.onSurfaceVariant}
            style={{
              backgroundColor: t.surfaceContainer,
              borderWidth: 1,
              borderColor: t.outlineVariant,
              borderRadius: radii.md,
              paddingHorizontal: 14,
              paddingVertical: 10,
              fontSize: 14,
              color: t.onSurface,
            }}
          />
          <PrimaryButton
            title="Start name vote"
            loadingTitle="Starting…"
            loading={startName.isPending}
            onPress={() => void confirmName()}
          />
        </View>
      </Modal>
    </Screen>
  )
}

function ReplacementBanner({
  round,
  memberById,
}: {
  round: ReplacementRound
  memberById: Map<string, MemberCard>
}) {
  const t = useTheme()
  const invited =
    round.invited_user_id && memberById.get(round.invited_user_id)?.display_name

  return (
    <Card>
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            {round.status === 'selecting_candidates' ? (
              <ActivityIndicator size="small" color={t.onPrimary} />
            ) : (
              <Hourglass size={20} color={t.onPrimary} strokeWidth={1.5} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            {round.status === 'selecting_candidates' ? (
              <>
                <Text style={{ fontSize: 16, fontWeight: '600', color: t.onSurface }}>
                  Finding a new member
                </Text>
                <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
                  A member recently left. No one is waiting in line yet. We check hourly
                  and will invite the next eligible person as soon as someone queues.
                </Text>
              </>
            ) : round.status === 'inviting' ? (
              <>
                <Text style={{ fontSize: 16, fontWeight: '600', color: t.onSurface }}>
                  Invitation sent
                </Text>
                <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>
                  {invited
                    ? `Waiting for ${invited} to respond.`
                    : 'Waiting for the selected candidate to respond.'}
                </Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 16, fontWeight: '600', color: t.onSurface }}>
                  Replacement in progress
                </Text>
                <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>Finding the next member.</Text>
              </>
            )}
          </View>
        </View>
      </View>
    </Card>
  )
}

function ActiveVoteCard({
  vote,
  myChoice,
  memberById,
  pending,
  onVote,
  castCount,
  quorum,
}: {
  vote: VoteRow
  myChoice: string | null
  memberById: Map<string, MemberCard>
  pending: boolean
  onVote: (voteId: string, choice: string) => void
  castCount: number
  quorum: number
}) {
  const t = useTheme()
  const target = vote.target_member_id ? memberById.get(vote.target_member_id) : null

  return (
    <Card>
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.primary }}>
          {VOTE_TYPE_LABEL[vote.type as GovernableVoteType]}
        </Text>
        <Text style={{ marginTop: 2, fontSize: 16, fontWeight: '600', color: t.onSurface }}>
          {vote.type === 'replace_member' ? (
            <>Replace {target ? target.display_name : 'a member'}</>
          ) : (
            <>Rename cluster to “{vote.name_suggestion}”</>
          )}
        </Text>
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.surfaceContainer, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' }}>
          <Hourglass size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>
            Ends in <CountdownTimer deadline={vote.closes_at} />
          </Text>
        </View>
      </View>

      <Text style={{ marginTop: 8, fontSize: 12, fontWeight: '500', color: t.onSurfaceVariant }}>
        {`${castCount} of ${quorum} votes cast.`}
      </Text>
      {myChoice ? (
        <Text style={{ marginTop: 16, fontSize: 14, fontWeight: '600', color: t.onSurface }}>
          You voted: <Text style={{ color: t.primary }}>{myChoice}</Text>
        </Text>
      ) : (
        <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
          <Pressable
            disabled={pending}
            onPress={() => onVote(vote.id, 'yes')}
            style={{ flex: 1, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 12, alignItems: 'center', opacity: pending ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Yes</Text>
          </Pressable>
          <Pressable
            disabled={pending}
            onPress={() => onVote(vote.id, 'no')}
            style={{ flex: 1, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 12, alignItems: 'center', opacity: pending ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>No</Text>
          </Pressable>
        </View>
      )}
    </Card>
  )
}

function PastVoteCard({
  vote,
  memberById,
  castCount,
}: {
  vote: VoteRow
  memberById: Map<string, MemberCard>
  castCount: number
}) {
  const t = useTheme()
  const scheme = useResolvedScheme()
  const yesColor = scheme === 'dark' ? YES_TALLY.dark : YES_TALLY.light
  const result = parseVoteResult(vote.result)
  const passed = result?.outcome === 'passed'
  const target = vote.target_member_id ? memberById.get(vote.target_member_id) : null

  return (
    <Card>
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.onSurfaceVariant }}>
              {VOTE_TYPE_LABEL[vote.type as GovernableVoteType]}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 16, fontWeight: '600', color: t.onSurface }}>
              {vote.type === 'replace_member' ? (
                <>Replace {target ? target.display_name : 'a member'}</>
              ) : (
                <>Rename cluster to “{vote.name_suggestion}”</>
              )}
            </Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: passed ? t.primary : t.error }}>
            {passed ? 'Passed' : 'Failed'}
          </Text>
        </View>

        <Text style={{ marginTop: 12, fontSize: 14, color: t.onSurfaceVariant }}>
          {vote.type === 'replace_member' && passed && 'A replacement round has started.'}
          {vote.type === 'replace_member' && !passed && 'The member stays.'}
          {vote.type === 'change_name' && passed &&
            `Cluster renamed to “${result?.name ?? vote.name_suggestion}”.`}
          {vote.type === 'change_name' && !passed && 'The cluster keeps its name.'}
        </Text>

        <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ThumbsUp size={14} color={yesColor} strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '500', color: yesColor }}>{result?.yes ?? 0} yes</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ThumbsDown size={14} color={t.error} strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '500', color: t.error }}>{result?.no ?? 0} no</Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '500', color: t.onSurfaceVariant }}>{result?.cast ?? castCount}/{result?.quorum ?? '-'} cast</Text>
        </View>
      </View>
    </Card>
  )
}

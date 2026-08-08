import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useDocumentTitle } from '../../lib/use-document-title'
import { ArrowRight, Hourglass, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../app/auth-context'
import { useClusterMembers } from '../../features/matching'
import {
  useClusterVotes,
  useClusterVoteResponses,
  useReplacementRound,
  useReplacementCandidates,
  useStartReplaceVote,
  useStartNameVote,
  useVoteOn,
  parseVoteResult,
  type CandidateProfile,
  type ReplacementRound,
  type Vote as VoteRow,
} from '../../features/votes'
import { Modal } from '../../components/Modal'
import { Avatar } from '../../components/Avatar'
import { CountdownTimer } from '../../components/CountdownTimer'
import { toErrorMessage } from '../../lib/error'

type MemberCard = { id: string; display_name: string; avatar_url: string | null }

const VOTE_TYPE_LABEL: Record<VoteRow['type'], string> = {
  replace_member: 'Replace member',
  change_name: 'Rename cluster',
  select_candidate: 'Choose a new member',
}

export function VotesView() {
  useDocumentTitle('Votes')
  const { clusterId = '' } = useParams()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  const votes = useClusterVotes(clusterId)
  const responses = useClusterVoteResponses(clusterId)
  const round = useReplacementRound(clusterId)
  const candidates = useReplacementCandidates(round.data?.id ?? null, round.data != null)
  const members = useClusterMembers(clusterId)

  const startReplace = useStartReplaceVote(clusterId)
  const startName = useStartNameVote(clusterId)
  const voteOn = useVoteOn(clusterId)

  const [modal, setModal] = useState<'replace' | 'name' | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [nameSuggestion, setNameSuggestion] = useState('')
  const [pendingVoteId, setPendingVoteId] = useState<string | null>(null)
  const [voteError, setVoteError] = useState<string | null>(null)

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
    for (const r of responses.data ?? []) {
      if (r.user_id === userId) map.set(r.vote_id, r.choice)
    }
    return map
  }, [responses.data, userId])

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

  if (votes.isLoading || responses.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading votes…
      </div>
    )
  }

  const openVotes = (votes.data ?? []).filter((v) => v.status === 'open')
  const closedVotes = (votes.data ?? []).filter((v) => v.status === 'closed')
  const roundVoting = round.data && round.data.status === 'voting'

  return (
    <section aria-label="Votes" className="space-y-5">
      {voteError && (
        <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
          {voteError}
        </p>
      )}

      {/* Start a vote */}
      <div className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <h2 className="font-display text-lg font-semibold text-on-surface">Govern the cluster</h2>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Any member can start a community vote. Results are hidden until it closes.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setModal('replace')}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            Replace a member <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setModal('name')}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            Suggest a cluster name <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Replacement round status */}
      {round.data && (
        <ReplacementBanner
          round={round.data}
          candidates={candidates.data ?? []}
          memberById={memberById}
        />
      )}

      {/* Active votes */}
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-on-surface">Active votes</h2>
        {openVotes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container/40 p-8 text-center text-sm text-on-surface-variant">
            No open votes right now.
          </div>
        ) : (
          openVotes.map((vote) => (
            <ActiveVoteCard
              key={vote.id}
              vote={vote}
              myChoice={myChoiceByVote.get(vote.id) ?? null}
              candidates={vote.type === 'select_candidate' ? (candidates.data ?? []) : []}
              showCandidates={Boolean(
                roundVoting && round.data?.select_candidate_vote_id === vote.id,
              )}
              memberById={memberById}
              pending={pendingVoteId === vote.id}
              onVote={castVote}
            />
          ))
        )}
      </div>

      {/* Past votes */}
      {closedVotes.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-on-surface">Past votes</h2>
          <ul className="space-y-3">
            {closedVotes.map((vote) => (
              <PastVoteCard
                key={vote.id}
                vote={vote}
                memberById={memberById}
                castCount={(responses.data ?? []).filter((r) => r.vote_id === vote.id).length}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Modals */}
      <Modal open={modal === 'replace'} onClose={() => setModal(null)} title="Replace a member">
        <div className="space-y-3">
          <p className="text-sm text-on-surface-variant">
            Pick who you’d like to put up for a community vote. Passing starts a replacement search.
          </p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {(members.data ?? [])
              .filter((m) => m.id !== userId)
              .map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setTargetId(m.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                      targetId === m.id
                        ? 'border-primary bg-primary-container/20'
                        : 'border-outline-variant/60 hover:bg-surface-container',
                    )}
                  >
                    <Avatar name={m.display_name} src={m.avatar_url} className="h-9 w-9" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-on-surface">
                        {m.display_name}
                      </span>
                      <span className="block truncate text-xs text-on-surface-variant">
                        {m.current_status || 'Cluster member'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          <button
            type="button"
            disabled={!targetId || startReplace.isPending}
            onClick={() => void confirmReplace()}
            className="w-full rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {startReplace.isPending ? 'Starting…' : 'Start replacement vote'}
          </button>
        </div>
      </Modal>

      <Modal open={modal === 'name'} onClose={() => setModal(null)} title="Suggest a cluster name">
        <div className="space-y-3">
          <p className="text-sm text-on-surface-variant">
            Propose a new name for this cluster. Passing renames it for everyone.
          </p>
          <input
            type="text"
            value={nameSuggestion}
            onChange={(e) => setNameSuggestion(e.target.value)}
            maxLength={60}
            placeholder="New cluster name"
            className="w-full rounded-xl border border-outline-variant/60 bg-surface-container/40 px-3.5 py-2.5 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary"
          />
          <button
            type="button"
            disabled={!nameSuggestion.trim() || startName.isPending}
            onClick={() => void confirmName()}
            className="w-full rounded-pill bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {startName.isPending ? 'Starting…' : 'Start name vote'}
          </button>
        </div>
      </Modal>
    </section>
  )
}

function ReplacementBanner({
  round,
  candidates,
  memberById,
}: {
  round: ReplacementRound
  candidates: CandidateProfile[]
  memberById: Map<string, MemberCard>
}) {
  const invited =
    round.invited_user_id &&
    (candidates.find((c) => c.user_id === round.invited_user_id)?.display_name ||
      memberById.get(round.invited_user_id)?.display_name)

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary-container/15 p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-on-primary">
          {round.status === 'selecting_candidates' ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <Hourglass className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          {round.status === 'selecting_candidates' ? (
            <>
              <p className="font-display text-base font-semibold text-on-surface">
                Finding replacement candidates
              </p>
              <p className="text-sm text-on-surface-variant">
                A member recently left. We’re sourcing a new cluster member.
              </p>
            </>
          ) : round.status === 'inviting' ? (
            <>
              <p className="font-display text-base font-semibold text-on-surface">
                Invitation sent
              </p>
              <p className="text-sm text-on-surface-variant">
                {invited
                  ? `Waiting for ${invited} to respond.`
                  : 'Waiting for the selected candidate to respond.'}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-base font-semibold text-on-surface">
                Candidate selection in progress
              </p>
              <p className="text-sm text-on-surface-variant">Cast your vote below.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ActiveVoteCard({
  vote,
  myChoice,
  candidates,
  showCandidates,
  memberById,
  pending,
  onVote,
}: {
  vote: VoteRow
  myChoice: string | null
  candidates: CandidateProfile[]
  showCandidates: boolean
  memberById: Map<string, MemberCard>
  pending: boolean
  onVote: (voteId: string, choice: string) => void
}) {
  const target = vote.target_member_id ? memberById.get(vote.target_member_id) : null

  return (
    <article className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {VOTE_TYPE_LABEL[vote.type]}
          </p>
          <h3 className="mt-0.5 font-display text-base font-semibold text-on-surface">
            {vote.type === 'replace_member' ? (
              <>Replace {target ? target.display_name : 'a member'}</>
            ) : vote.type === 'change_name' ? (
              <>Rename cluster to “{vote.name_suggestion}”</>
            ) : (
              'Pick the next cluster member'
            )}
          </h3>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant">
          <Hourglass className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          Ends in <CountdownTimer deadline={vote.closes_at} />
        </span>
      </div>

      {vote.type === 'select_candidate' ? (
        showCandidates && candidates.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {candidates.map((c) => {
              const selected = myChoice === c.user_id
              return (
                <li key={c.user_id}>
                  <button
                    type="button"
                    disabled={pending || myChoice !== null}
                    onClick={() => onVote(vote.id, c.user_id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary-container/20'
                        : 'border-outline-variant/60 hover:bg-surface-container disabled:opacity-60',
                    )}
                  >
                    <Avatar name={c.display_name} src={c.avatar_url} className="h-10 w-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-on-surface">
                        {c.display_name}
                      </span>
                      <span className="block text-xs text-on-surface-variant">
                        {selected
                          ? 'You voted for this candidate'
                          : myChoice
                            ? 'Another candidate was chosen'
                            : 'Tap to vote'}
                      </span>
                    </span>
                    {pending && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-on-surface-variant">
            Candidates are being prepared. Vote will open shortly.
          </p>
        )
      ) : (
        <div className="mt-4">
          {myChoice ? (
            <p className="text-sm font-semibold text-on-surface">
              You voted: <span className="capitalize text-primary">{myChoice}</span>
            </p>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => onVote(vote.id, 'yes')}
                className="flex-1 rounded-pill border border-outline-variant/60 px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
              >
                Yes
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onVote(vote.id, 'no')}
                className="flex-1 rounded-pill border border-outline-variant/60 px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
              >
                No
              </button>
            </div>
          )}
        </div>
      )}
    </article>
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
  const result = parseVoteResult(vote.result)
  const passed = result?.outcome === 'passed' || /^[0-9a-f]{8}-/i.test(result?.outcome ?? '')
  const target = vote.target_member_id ? memberById.get(vote.target_member_id) : null
  const winner = passed && result?.outcome && memberById.get(result.outcome)

  return (
    <li className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            {VOTE_TYPE_LABEL[vote.type]}
          </p>
          <h3 className="mt-0.5 font-display text-base font-semibold text-on-surface">
            {vote.type === 'replace_member' ? (
              <>Replace {target ? target.display_name : 'a member'}</>
            ) : vote.type === 'change_name' ? (
              <>Rename cluster to “{vote.name_suggestion}”</>
            ) : (
              'Choose a new member'
            )}
          </h3>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-pill px-3 py-1 text-xs font-semibold',
            passed ? 'bg-emerald-500/15 text-emerald-700' : 'bg-error/10 text-error',
          )}
        >
          {vote.type === 'select_candidate'
            ? winner
              ? 'Selected'
              : passed
                ? 'Selected'
                : 'Failed'
            : result?.outcome === 'passed'
              ? 'Passed'
              : 'Failed'}
        </span>
      </div>

      <p className="mt-3 text-sm text-on-surface-variant">
        {vote.type === 'replace_member' && passed && 'A replacement round has started.'}
        {vote.type === 'replace_member' && !passed && 'The member stays.'}
        {vote.type === 'change_name' && passed &&
          `Cluster renamed to “${result?.name ?? vote.name_suggestion}”.`}
        {vote.type === 'change_name' && !passed && 'The cluster keeps its name.'}
        {vote.type === 'select_candidate' &&
          (winner
            ? `${winner.display_name} was selected.`
            : passed
              ? 'A new member was selected.'
              : 'No candidate was selected.')}
      </p>

      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-on-surface-variant">
        {vote.type === 'select_candidate' ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-container px-2.5 py-1">
              {castCount} {castCount === 1 ? 'vote' : 'votes'} cast
            </span>
            <span className="inline-flex items-center rounded-pill bg-surface-container px-2.5 py-1">
              quorum {result?.quorum ?? '–'}
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-emerald-500/15 px-2.5 py-1 text-emerald-700">
              <ThumbsUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {result?.yes ?? 0}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-error/10 px-2.5 py-1 text-error">
              <ThumbsDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {result?.no ?? 0}
            </span>
            <span className="inline-flex items-center rounded-pill bg-surface-container px-2.5 py-1">
              {result?.cast ?? castCount}/{result?.quorum ?? '–'} cast
            </span>
          </>
        )}
      </p>
    </li>
  )
}

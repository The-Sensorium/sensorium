import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { VotesView } from './VotesView'

const hooks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClusterMembers: vi.fn(),
  useClusterVotes: vi.fn(),
  useClusterVoteResponses: vi.fn(),
  useReplacementRound: vi.fn(),
  useReplacementCandidates: vi.fn(),
  useStartReplaceVote: vi.fn(),
  useStartNameVote: vi.fn(),
  useVoteOn: vi.fn(),
  useAvatarUrl: vi.fn(),
}))

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useParams: () => ({ clusterId: 'c1' }) }
})
vi.mock('../../app/auth-context', () => ({ useAuth: hooks.useAuth }))
vi.mock('../../features/matching', () => ({ useClusterMembers: hooks.useClusterMembers }))
vi.mock('../../features/avatars', () => ({ useAvatarUrl: hooks.useAvatarUrl }))
vi.mock('../../features/votes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/votes')>()
  return {
    ...actual,
    useClusterVotes: hooks.useClusterVotes,
    useClusterVoteResponses: hooks.useClusterVoteResponses,
    useReplacementRound: hooks.useReplacementRound,
    useReplacementCandidates: hooks.useReplacementCandidates,
    useStartReplaceVote: hooks.useStartReplaceVote,
    useStartNameVote: hooks.useStartNameVote,
    useVoteOn: hooks.useVoteOn,
  }
})
vi.mock('../../components/CountdownTimer', () => ({
  CountdownTimer: () => <span>2h 0m</span>,
}))

const baseVote = {
  id: 'v1',
  cluster_id: 'c1',
  initiated_by: 'u2',
  created_at: '2026-01-01T00:00:00Z',
  closes_at: '2026-01-02T00:00:00Z',
  status: 'open',
  result: null,
  target_member_id: null,
  name_suggestion: null,
  type: 'change_name',
}

const members = [
  { id: 'm1', display_name: 'Bo', avatar_url: null, current_status: 'busy' },
  { id: 'u1', display_name: 'Ally', avatar_url: null, current_status: 'ok' },
]

const startReplace = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }
const startName = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }
const voteOn = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }

function renderPage() {
  return render(
    <MemoryRouter>
      <VotesView />
    </MemoryRouter>,
  )
}

function queryStub(data: unknown) {
  return { data, isLoading: false, isError: false }
}

describe('VotesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1' })
    hooks.useClusterMembers.mockReturnValue(queryStub(members))
    hooks.useClusterVotes.mockReturnValue(queryStub([]))
    hooks.useClusterVoteResponses.mockReturnValue(queryStub([]))
    hooks.useReplacementRound.mockReturnValue(queryStub(null))
    hooks.useReplacementCandidates.mockReturnValue(queryStub([]))
    hooks.useStartReplaceVote.mockReturnValue(startReplace)
    hooks.useStartNameVote.mockReturnValue(startName)
    hooks.useVoteOn.mockReturnValue(voteOn)
    hooks.useAvatarUrl.mockReturnValue({ data: undefined })
  })

  it('shows the loading state while votes load', () => {
    hooks.useClusterVotes.mockReturnValue({ data: [], isLoading: true, isError: false })
    renderPage()
    expect(screen.getByText('Loading votes…')).toBeInTheDocument()
  })

  it('shows an empty state when there are no open votes', () => {
    renderPage()
    expect(screen.getByText('No open votes right now.')).toBeInTheDocument()
  })

  it('casts a yes/no vote on a replace-member vote', async () => {
    hooks.useClusterVotes.mockReturnValue(
      queryStub([{ ...baseVote, id: 'v1', type: 'replace_member', target_member_id: 'm1' }]),
    )
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    await waitFor(() => expect(voteOn.mutateAsync).toHaveBeenCalledWith({ voteId: 'v1', choice: 'no' }))
  })

  it('shows the caller’s own choice instead of the buttons', () => {
    hooks.useClusterVotes.mockReturnValue(
      queryStub([{ ...baseVote, id: 'v1', type: 'replace_member', target_member_id: 'm1' }]),
    )
    hooks.useClusterVoteResponses.mockReturnValue(
      queryStub([{ vote_id: 'v1', user_id: 'u1', choice: 'yes', created_at: '' }]),
    )
    renderPage()
    expect(screen.getByText('You voted:')).toBeInTheDocument()
    expect(screen.getByText('yes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument()
  })

  it('surfaces a vote error', async () => {
    hooks.useClusterVotes.mockReturnValue(
      queryStub([{ ...baseVote, id: 'v1', type: 'replace_member', target_member_id: 'm1' }]),
    )
    hooks.useVoteOn.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('nope')),
      isPending: false,
    })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('nope'))
  })

  it('lists select-candidate options only for the matching round vote', () => {
    const round = {
      id: 'r1',
      cluster_id: 'c1',
      status: 'voting',
      select_candidate_vote_id: 'v2',
      invited_user_id: null,
    }
    hooks.useClusterVotes.mockReturnValue(
      queryStub([{ ...baseVote, id: 'v2', type: 'select_candidate' }]),
    )
    hooks.useReplacementRound.mockReturnValue(queryStub(round))
    hooks.useReplacementCandidates.mockReturnValue(
      queryStub([{ user_id: 'c1', display_name: 'Cara', avatar_url: null }]),
    )
    renderPage()
    expect(screen.getByText('Pick the next cluster member')).toBeInTheDocument()
    expect(screen.getByText('Cara')).toBeInTheDocument()
  })

  it('starts a replacement vote from the modal', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Replace a member/ }))
    const dialog = screen.getByRole('dialog', { name: 'Replace a member' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Bo/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start replacement vote' }))
    await waitFor(() => expect(startReplace.mutateAsync).toHaveBeenCalledWith('m1'))
  })

  it('starts a name vote from the modal', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Suggest a cluster name/ }))
    const dialog = screen.getByRole('dialog', { name: 'Suggest a cluster name' })
    const input = within(dialog).getByPlaceholderText('New cluster name')
    fireEvent.change(input, { target: { value: 'Aurora' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start name vote' }))
    await waitFor(() => expect(startName.mutateAsync).toHaveBeenCalledWith('Aurora'))
  })

  it('shows a passed replace-member vote in the past votes list', () => {
    hooks.useClusterVotes.mockReturnValue(
      queryStub([
        {
          ...baseVote,
          id: 'v9',
          type: 'replace_member',
          target_member_id: 'm1',
          status: 'closed',
          result: { outcome: 'passed', yes: 3, no: 1, cast: 4, quorum: 3 },
        },
      ]),
    )
    hooks.useClusterVoteResponses.mockReturnValue(
      queryStub([
        { vote_id: 'v9', user_id: 'u1', choice: 'yes', created_at: '' },
        { vote_id: 'v9', user_id: 'u2', choice: 'yes', created_at: '' },
        { vote_id: 'v9', user_id: 'u3', choice: 'no', created_at: '' },
      ]),
    )
    renderPage()
    expect(screen.getByText('Past votes')).toBeInTheDocument()
    expect(screen.getByText('A replacement round has started.')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { VotesView } from './VotesView'

const hooks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClusterMembers: vi.fn(),
  useClusterVotes: vi.fn(),
  useVoteCounts: vi.fn(),
  useReplacementRound: vi.fn(),
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
    useVoteCounts: hooks.useVoteCounts,
    useReplacementRound: hooks.useReplacementRound,
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
    hooks.useVoteCounts.mockReturnValue(queryStub([]))
    hooks.useReplacementRound.mockReturnValue(queryStub(null))
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
    hooks.useVoteCounts.mockReturnValue(
      queryStub([{ vote_id: 'v1', cast_count: 1, my_choice: 'yes' }]),
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

  it('hides legacy select-candidate votes instead of rendering a ballot', () => {
    hooks.useClusterVotes.mockReturnValue(
      queryStub([{ ...baseVote, id: 'v2', type: 'select_candidate' }]),
    )
    renderPage()
    expect(screen.getByText('No open votes right now.')).toBeInTheDocument()
    expect(screen.queryByText('Pick the next cluster member')).not.toBeInTheDocument()
    expect(screen.queryByText('Candidate selection in progress')).not.toBeInTheDocument()
  })

  it('explains the wait when no candidates are queued yet', () => {
    hooks.useReplacementRound.mockReturnValue(
      queryStub({ id: 'r1', cluster_id: 'c1', status: 'selecting_candidates' }),
    )
    renderPage()
    expect(screen.getByText('Finding a new member')).toBeInTheDocument()
    expect(screen.getByText(/No one is waiting in line yet/)).toBeInTheDocument()
  })

  it('shows quorum progress on a governance vote', () => {
    hooks.useClusterVotes.mockReturnValue(
      queryStub([{ ...baseVote, id: 'v1', type: 'replace_member', target_member_id: 'm1' }]),
    )
    hooks.useVoteCounts.mockReturnValue(
      queryStub([{ vote_id: 'v1', cast_count: 1, my_choice: null }]),
    )
    renderPage()
    expect(screen.getByText('1 of 2 votes needed.')).toBeInTheDocument()
  })

  it('confirms quorum without implying an early close', () => {
    hooks.useClusterVotes.mockReturnValue(
      queryStub([{ ...baseVote, id: 'v1', type: 'change_name', name_suggestion: 'Aurora' }]),
    )
    hooks.useVoteCounts.mockReturnValue(
      queryStub([{ vote_id: 'v1', cast_count: 2, my_choice: 'yes' }]),
    )
    renderPage()
    expect(screen.getByText('Quorum reached (2 of 2 votes).')).toBeInTheDocument()
  })

  it('shows the invitation banner with generic copy for a non-member invitee', () => {
    // The invitee is never a cluster member yet, so no display name resolves.
    hooks.useReplacementRound.mockReturnValue(
      queryStub({ id: 'r1', cluster_id: 'c1', status: 'inviting', invited_user_id: 'x1' }),
    )
    renderPage()
    expect(screen.getByText('Invitation sent')).toBeInTheDocument()
    expect(screen.getByText('Waiting for the selected candidate to respond.')).toBeInTheDocument()
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
    hooks.useVoteCounts.mockReturnValue(
      queryStub([{ vote_id: 'v9', cast_count: 3, my_choice: 'yes' }]),
    )
    renderPage()
    expect(screen.getByText('Past votes')).toBeInTheDocument()
    expect(screen.getByText('A replacement round has started.')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
  })
})

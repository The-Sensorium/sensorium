import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { MeetupsView } from './MeetupsView'

const hooks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClusterMembers: vi.fn(),
  useClusterMeetups: vi.fn(),
  useMeetupState: vi.fn(),
  useCreateMeetup: vi.fn(),
  useVoteMeetupSlot: vi.fn(),
  useCancelMeetup: vi.fn(),
  useCheckInMeetup: vi.fn(),
  useRsvpMeetup: vi.fn(),
  useActiveCall: vi.fn(),
  useJoinCall: vi.fn(),
  useStartCall: vi.fn(),
  useLeaveCall: vi.fn(),
  useAvatarUrl: vi.fn(),
}))

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useParams: () => ({ clusterId: 'c1' }) }
})
vi.mock('../../app/auth-context', () => ({ useAuth: hooks.useAuth }))
vi.mock('../../features/avatars', () => ({ useAvatarUrl: hooks.useAvatarUrl }))
vi.mock('../../features/matching', () => ({ useClusterMembers: hooks.useClusterMembers }))
vi.mock('../../features/cluster-calls', () => ({
  useActiveCall: hooks.useActiveCall,
  useJoinCall: hooks.useJoinCall,
  useStartCall: hooks.useStartCall,
  useLeaveCall: hooks.useLeaveCall,
}))
vi.mock('../../features/meetups', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/meetups')>()
  return {
    ...actual,
    useClusterMeetups: hooks.useClusterMeetups,
    useMeetupState: hooks.useMeetupState,
    useCreateMeetup: hooks.useCreateMeetup,
    useVoteMeetupSlot: hooks.useVoteMeetupSlot,
    useCancelMeetup: hooks.useCancelMeetup,
    useCheckInMeetup: hooks.useCheckInMeetup,
    useRsvpMeetup: hooks.useRsvpMeetup,
  }
})
vi.mock('../../components/CountdownTimer', () => ({
  CountdownTimer: () => <span>2h 0m</span>,
}))

const members = [
  { id: 'u1', display_name: 'Ally', avatar_url: null },
  { id: 'u2', display_name: 'Bo', avatar_url: null },
  { id: 'u3', display_name: 'Cy', avatar_url: null },
]

function callStubs() {
  hooks.useActiveCall.mockReturnValue({ data: null })
  hooks.useJoinCall.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  hooks.useStartCall.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  hooks.useLeaveCall.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
}

function votingState() {
  return {
    meetup: {
      id: 'm1',
      cluster_id: 'c1',
      created_by: 'u2',
      status: 'voting',
      voting_closes_at: '2026-10-10T00:00:00.000Z',
      starts_at: null,
      confirmed_slot_id: null,
    },
    slots: [
      { id: 's1', starts_at: '2026-10-11T19:00:00.000Z', ends_at: '2026-10-11T20:00:00.000Z', vote_count: 2 },
      { id: 's2', starts_at: '2026-10-12T19:00:00.000Z', ends_at: '2026-10-12T20:00:00.000Z', vote_count: 1 },
    ],
    my_slot_id: null,
    my_rsvp: null,
    votes_cast: 3,
    going_count: 0,
    going_user_ids: [],
    checked_in_count: 0,
    my_feedback: null,
    voters: [
      { slot_id: 's1', user_id: 'u1' },
      { slot_id: 's1', user_id: 'u2' },
      { slot_id: 's2', user_id: 'u3' },
    ],
    quorum: 3,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hooks.useClusterMembers.mockReturnValue({ data: members, isPending: false })
  hooks.useCreateMeetup.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue('m1'), isPending: false })
  hooks.useVoteMeetupSlot.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false })
  hooks.useCancelMeetup.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false })
  hooks.useCheckInMeetup.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false })
  hooks.useRsvpMeetup.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false })
  hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' })
  hooks.useAvatarUrl.mockReturnValue({ data: null })
  callStubs()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <MeetupsView />
    </MemoryRouter>,
  )
}

describe('MeetupsView', () => {
  it('shows the propose card linking to the ballot builder', () => {
    hooks.useClusterMeetups.mockReturnValue({ data: [], isPending: false, isError: false })
    renderPage()
    expect(screen.getByText('Cluster Meetup')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Propose a time' })
    expect(link.getAttribute('href')).toBe('/cluster/c1/meetups/new')
  })

  it('shows the voting ballot with slot counts and submits a vote', async () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'voting' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: votingState(), isPending: false, isError: false })
    const vote = vi.fn().mockResolvedValue(undefined)
    hooks.useVoteMeetupSlot.mockReturnValue({ mutateAsync: vote, isPending: false })
    renderPage()
    expect(screen.getByText('When should we meet?')).toBeTruthy()
    expect(screen.getByText('Choose a time that works for you.')).toBeTruthy()
    const options = screen.getAllByRole('radio')
    fireEvent.click(options[0])
    fireEvent.click(screen.getByText('Submit vote'))
    await waitFor(() => expect(vote).toHaveBeenCalledWith('s1'))
  })

  it('shows quorum copy after voting', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'voting' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: { ...votingState(), my_slot_id: 's1' },
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('Finding a time')).toBeTruthy()
    expect(screen.getByText('3 of 3 members have voted')).toBeTruthy()
    expect(screen.getByText('A meetup is set when 3 people choose the same time.')).toBeTruthy()
    expect(screen.getByText('Your pick')).toBeTruthy()
    expect(screen.getByText('Change my vote')).toBeTruthy()
    expect(screen.getByText('Back to room')).toBeTruthy()
  })

  it('confirms the vote right after submitting', async () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'voting' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: votingState(), isPending: false, isError: false })
    const vote = vi.fn().mockResolvedValue(undefined)
    hooks.useVoteMeetupSlot.mockReturnValue({ mutateAsync: vote, isPending: false })
    renderPage()
    fireEvent.click(screen.getAllByRole('radio')[0])
    fireEvent.click(screen.getByText('Submit vote'))
    await waitFor(() => expect(vote).toHaveBeenCalledWith('s1'))
    expect(screen.queryByText(/Vote counted/)).toBeNull()
  })

  it('opens edit mode with submit change and keep options', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'voting' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: { ...votingState(), my_slot_id: 's1' },
      isPending: false,
      isError: false,
    })
    renderPage()
    fireEvent.click(screen.getByText('Change my vote'))
    expect(screen.getByText('Choose a new time for the meetup.')).toBeTruthy()
    expect(screen.getByText('Update my vote')).toBeTruthy()
    expect(screen.getByText('Keep my current vote')).toBeTruthy()
    fireEvent.click(screen.getByText('Keep my current vote'))
    expect(screen.getByText('Finding a time')).toBeTruthy()
  })

  it('shows the confirmed state with a join button', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          status: 'confirmed',
          starts_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: 's1',
        my_rsvp: 'going',
        votes_cast: 5,
        // No going_user_ids: exercises the pre-0183 votes_cast fallback.
        going_user_ids: undefined,
      },
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('Your cluster meetup is set')).toBeTruthy()
    expect(screen.getByText('5 members joining')).toBeTruthy()
    const join = screen.getByText('Join Meetup')
    expect(join).toBeTruthy()
    expect(join.closest('button')?.disabled).toBe(false)
  })

  it('disables joining far out with the merged timing copy', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          status: 'confirmed',
          starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: 's1',
        my_rsvp: 'going',
        votes_cast: 3,
        // No going_user_ids: exercises the pre-0183 votes_cast fallback.
        going_user_ids: undefined,
      },
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('Your cluster meetup is set')).toBeTruthy()
    expect(screen.getByText('3 members joining')).toBeTruthy()
    expect(screen.getByText('Join Meetup').closest('button')?.disabled).toBe(true)
    expect(screen.getByText(/Join opens 10 minutes before it starts\. We’ll remind you\./)).toBeTruthy()
    expect(screen.queryByText('Leave feedback')).toBeNull()
    expect(screen.getByText('Times are shown in your local time.')).toBeTruthy()
  })

  it('shows Live now instead of Starts in Expired once started', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'starting' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          status: 'starting',
          starts_at: new Date(Date.now() - 60_000).toISOString(),
          ends_at: new Date(Date.now() + 50 * 60_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: 's1',
        votes_cast: 3,
      },
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('Your cluster meetup is set')).toBeTruthy()
    expect(screen.getByText(/Live now/)).toBeTruthy()
    expect(screen.queryByText('Leave feedback')).toBeNull()
    expect(screen.queryByText('Share feedback')).toBeNull()
  })

  it('shows the ended You met state after end plus grace', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'active' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          status: 'active',
          starts_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
          ends_at: new Date(Date.now() - 20 * 60_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: 's1',
        votes_cast: 3,
        checked_in_count: 3,
      },
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('You met this week')).toBeTruthy()
    expect(screen.getByText('This meetup has ended.')).toBeTruthy()
    expect(screen.queryByText('Join Meetup')).toBeNull()
    expect(screen.queryByText('Propose a time for next week')).toBeNull()
  })

  it('keeps Join for rejoin while the join window is still open', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'active' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          status: 'active',
          starts_at: new Date(Date.now() - 90 * 60_000).toISOString(),
          ends_at: new Date(Date.now() - 30 * 60_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: 's1',
        my_rsvp: 'going',
        votes_cast: 3,
        checked_in_count: 2,
      },
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('Your cluster meetup is set')).toBeTruthy()
    expect(screen.getByText('Join Meetup')).toBeTruthy()
    expect(screen.queryByText('You met this week')).toBeNull()
  })

  it('shows the completed return state', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'completed' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: { id: 'm1', cluster_id: 'c1', status: 'completed', starts_at: '2026-10-04T19:00:00.000Z', confirmed_slot_id: 's1', voting_closes_at: null },
        checked_in_count: 5,
      },
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('You met this week')).toBeTruthy()
  })

  it('shows withdraw only to the creator while voting', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'voting' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: votingState(), isPending: false, isError: false })
    renderPage()
    expect(screen.queryByText('Withdraw proposal')).toBeNull()
  })

  it('shows withdraw to the creator while voting', () => {
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u2', email: 'a@b.test' })
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'voting' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: votingState(), isPending: false, isError: false })
    renderPage()
    expect(screen.getByText('Withdraw proposal')).toBeTruthy()
  })

  it('hides withdraw after confirmation even for the creator', () => {
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u2', email: 'a@b.test' })
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          created_by: 'u2',
          status: 'confirmed',
          starts_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: 's1',
        votes_cast: 5,
      },
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('Your cluster meetup is set')).toBeTruthy()
    expect(screen.queryByText('Withdraw proposal')).toBeNull()
  })

  it('hides the expired banner for a withdrawn proposal', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'cancelled', cancelled_reason: 'withdrawn' }],
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.queryByText('This meetup expired')).toBeNull()
    expect(screen.getByText('Cluster Meetup')).toBeTruthy()
  })

  it('shows the expired state with a re-propose path', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'cancelled', cancelled_reason: 'expired' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: { id: 'm1', cluster_id: 'c1', status: 'cancelled', starts_at: null, confirmed_slot_id: null, voting_closes_at: '2026-10-01T00:00:00.000Z' },
      },
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('This meetup expired')).toBeTruthy()
  })

  it('lets a non-voter count themselves in after confirmation', async () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          status: 'confirmed',
          starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: null,
        my_rsvp: null,
        votes_cast: 3,
        going_count: 3,
      },
      isPending: false,
      isError: false,
    })
    const rsvp = vi.fn().mockResolvedValue(undefined)
    hooks.useRsvpMeetup.mockReturnValue({ mutateAsync: rsvp, isPending: false })
    renderPage()
    expect(screen.getByText("Didn't vote? You can still join us.")).toBeTruthy()
    fireEvent.click(screen.getByText('Count me in'))
    expect(screen.getByText('Count me in?')).toBeTruthy()
    expect(screen.getByText('You’ll be added to the meetup. We’ll remind you before it starts.')).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel'))
    expect(rsvp).not.toHaveBeenCalled()
    expect(screen.queryByText('Count me in?')).toBeNull()
    fireEvent.click(screen.getByText('Count me in'))
    const confirms = screen.getAllByText('Count me in')
    fireEvent.click(confirms[confirms.length - 1])
    await waitFor(() => expect(rsvp).toHaveBeenCalledWith('going'))
  })

  it('counts RSVPs instead of raw votes once going rows exist', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          status: 'confirmed',
          starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: null,
        my_rsvp: 'going',
        votes_cast: 3,
        going_count: 5,
      },
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('5 members joining')).toBeTruthy()
    expect(screen.queryByText('You’re in')).toBeNull()
    expect(screen.getByText('I can’t make it')).toBeTruthy()
  })

  it('confirms declining through a dialog that keeps the meetup time', async () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          status: 'confirmed',
          starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: 's1',
        my_rsvp: 'going',
        votes_cast: 3,
        going_count: 3,
      },
      isPending: false,
      isError: false,
    })
    const rsvp = vi.fn().mockResolvedValue(undefined)
    hooks.useRsvpMeetup.mockReturnValue({ mutateAsync: rsvp, isPending: false })
    renderPage()
    fireEvent.click(screen.getByText('I can’t make it'))
    expect(screen.getByText('Can’t make it?')).toBeTruthy()
    expect(screen.getByText('You’ll be removed from the meetup. The meetup time won’t change.')).toBeTruthy()
    fireEvent.click(screen.getByText('Keep me in'))
    expect(rsvp).not.toHaveBeenCalled()
    expect(screen.queryByText('Can’t make it?')).toBeNull()
    fireEvent.click(screen.getByText('I can’t make it'))
    const confirms = screen.getAllByText('I can’t make it')
    fireEvent.click(confirms[confirms.length - 1])
    await waitFor(() => expect(rsvp).toHaveBeenCalledWith('declined'))
  })

  it('shows a bare Count me in button after leaving, with no explainers', async () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          status: 'confirmed',
          starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: 's1',
        my_rsvp: 'declined',
        votes_cast: 3,
        going_count: 2,
      },
      isPending: false,
      isError: false,
    })
    const rsvp = vi.fn().mockResolvedValue(undefined)
    hooks.useRsvpMeetup.mockReturnValue({ mutateAsync: rsvp, isPending: false })
    renderPage()
    expect(screen.queryByText("Didn't vote? You can still join us.")).toBeNull()
    expect(screen.queryByText('The time is set. Count yourself in.')).toBeNull()
    expect(screen.queryByText('Join Meetup')).toBeNull()
    fireEvent.click(screen.getByText('Count me in'))
    const confirms = screen.getAllByText('Count me in')
    fireEvent.click(confirms[confirms.length - 1])
    await waitFor(() => expect(rsvp).toHaveBeenCalledWith('going'))
  })

  it('shows joining avatars from the live going list', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        going_user_ids: ['u1', 'u2', 'u3'],
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          status: 'confirmed',
          starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: 's1',
        my_rsvp: 'going',
        votes_cast: 3,
        going_count: 3,
      },
      isPending: false,
      isError: false,
    })
    renderPage()
    const row = screen.getByLabelText('3 members joining')
    expect(row.textContent).toContain('A')
    expect(row.textContent).toContain('B')
    expect(row.textContent).toContain('C')
  })

  it('drops a decliner face from the avatar row while keeping the count', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({
      data: {
        ...votingState(),
        going_user_ids: ['u1', 'u2'],
        meetup: {
          id: 'm1',
          cluster_id: 'c1',
          status: 'confirmed',
          starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
          confirmed_slot_id: 's1',
          voting_closes_at: '2026-10-10T00:00:00.000Z',
        },
        my_slot_id: 's2',
        my_rsvp: 'declined',
        votes_cast: 3,
        going_count: 2,
      },
      isPending: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('2 members joining')).toBeTruthy()
    const row = screen.getByLabelText('2 members joining')
    expect(row.textContent).toContain('A')
    expect(row.textContent).toContain('B')
    expect(row.textContent).not.toContain('C')
  })
})

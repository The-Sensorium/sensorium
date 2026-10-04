import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { MeetupCard } from './MeetupCard'

const hooks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClusterMeetups: vi.fn(),
  useMeetupState: vi.fn(),
}))

vi.mock('../../../app/auth-context', () => ({ useAuth: hooks.useAuth }))
vi.mock('../../../features/meetups', () => ({
  useClusterMeetups: hooks.useClusterMeetups,
  useMeetupState: hooks.useMeetupState,
}))

const KEY = 'sensorium:dismissed-meetup:u1:c1'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' })
})

function renderCard(props: { callLive?: boolean; clusterId?: string } = {}) {
  return render(
    <MemoryRouter>
      <MeetupCard clusterId={props.clusterId ?? 'c1'} callLive={props.callLive} />
    </MemoryRouter>,
  )
}

function rerenderCard(rerender: (ui: ReactElement) => void, props: { callLive?: boolean; clusterId?: string } = {}) {
  rerender(
    <MemoryRouter>
      <MeetupCard clusterId={props.clusterId ?? 'c1'} callLive={props.callLive} />
    </MemoryRouter>,
  )
}

describe('MeetupCard dismissal', () => {
  it('shows the vote prompt with a dismiss action while voting', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'voting', starts_at: null }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: { my_slot_id: null }, isPending: false, isError: false })
    renderCard()
    expect(screen.getByText('Vote for a time this week.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dismiss meetup banner' })).toBeTruthy()
  })

  it('hides a dismissed meetup and persists the dismissal', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'voting', starts_at: null }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: { my_slot_id: null }, isPending: false, isError: false })
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss meetup banner' }))
    expect(screen.queryByText('Cluster Meetup')).toBeNull()
    expect(localStorage.getItem(KEY)).toBe('m1')
  })

  it('shows a new meetup after dismissing the previous one', () => {
    localStorage.setItem(KEY, 'm0')
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed', starts_at: '2026-10-04T19:00:00.000Z' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: null, isPending: false, isError: false })
    renderCard()
    expect(screen.getByText('Cluster Meetup')).toBeTruthy()
  })

  it('shows the propose entry with a dismiss action', () => {
    hooks.useClusterMeetups.mockReturnValue({ data: [], isPending: false, isError: false })
    hooks.useMeetupState.mockReturnValue({ data: null, isPending: false, isError: false })
    renderCard()
    expect(screen.getByText('Propose a time')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dismiss meetup banner' })).toBeTruthy()
  })

  it('hides a dismissed propose entry until a new meetup appears', () => {
    hooks.useClusterMeetups.mockReturnValue({ data: [], isPending: false, isError: false })
    hooks.useMeetupState.mockReturnValue({ data: null, isPending: false, isError: false })
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss meetup banner' }))
    expect(screen.queryByText('Cluster Meetup')).toBeNull()
    expect(localStorage.getItem(KEY)).toBe('propose:c1:none')
  })

  it('hides the banner while a call is live', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed', starts_at: '2026-10-04T19:00:00.000Z' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: null, isPending: false, isError: false })
    renderCard({ callLive: true })
    expect(screen.queryByText('Cluster Meetup')).toBeNull()
  })

  it('hides the banner once the meetup has ended, even before expiry completes it', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [
        {
          id: 'm1',
          status: 'confirmed',
          starts_at: new Date(Date.now() - 90 * 60_000).toISOString(),
          ends_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        },
      ],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: null, isPending: false, isError: false })
    renderCard()
    expect(screen.queryByText('Cluster Meetup')).toBeNull()
  })

  it('hides the propose banner during the quiet week after completion', () => {
    const completedAt = new Date(Date.now() - 2 * 24 * 3600_000).toISOString()
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'completed', completed_at: completedAt, ends_at: completedAt }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: null, isPending: false, isError: false })
    renderCard()
    expect(screen.queryByText('Cluster Meetup')).toBeNull()
  })

  it('shows propose again after the quiet week passes', () => {
    const completedAt = new Date(Date.now() - 8 * 24 * 3600_000).toISOString()
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'completed', completed_at: completedAt, ends_at: completedAt }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: null, isPending: false, isError: false })
    renderCard()
    expect(screen.getByText('Propose a time')).toBeTruthy()
  })
})

describe('MeetupCard multi-cluster dismissal', () => {
  it('keeps each cluster dismissal independent', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed', starts_at: '2026-10-04T19:00:00.000Z' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: null, isPending: false, isError: false })
    const { rerender } = renderCard({ clusterId: 'c1' })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss meetup banner' }))
    expect(screen.queryByText('Cluster Meetup')).toBeNull()
    expect(localStorage.getItem(KEY)).toBe('m1')

    rerenderCard(rerender, { clusterId: 'c2' })
    expect(screen.getByText('Cluster Meetup')).toBeTruthy()
    expect(localStorage.getItem('sensorium:dismissed-meetup:u1:c2')).toBeNull()
  })

  it('loads the stored dismissal when switching clusters without remounting', () => {
    hooks.useClusterMeetups.mockReturnValue({
      data: [{ id: 'm1', status: 'confirmed', starts_at: '2026-10-04T19:00:00.000Z' }],
      isPending: false,
      isError: false,
    })
    hooks.useMeetupState.mockReturnValue({ data: null, isPending: false, isError: false })
    localStorage.setItem('sensorium:dismissed-meetup:u1:c2', 'm1')
    const { rerender } = renderCard({ clusterId: 'c1' })
    expect(screen.getByText('Cluster Meetup')).toBeTruthy()

    rerenderCard(rerender, { clusterId: 'c2' })
    expect(screen.queryByText('Cluster Meetup')).toBeNull()
  })

  it('does not hide another cluster empty propose after dismissing one', () => {
    hooks.useClusterMeetups.mockReturnValue({ data: [], isPending: false, isError: false })
    hooks.useMeetupState.mockReturnValue({ data: null, isPending: false, isError: false })
    const { rerender } = renderCard({ clusterId: 'c1' })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss meetup banner' }))
    expect(screen.queryByText('Cluster Meetup')).toBeNull()

    rerenderCard(rerender, { clusterId: 'c2' })
    expect(screen.getByText('Propose a time')).toBeTruthy()
  })
})

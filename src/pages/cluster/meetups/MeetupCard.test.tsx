import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

function renderCard() {
  return render(
    <MemoryRouter>
      <MeetupCard clusterId="c1" />
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

  it('keeps the propose entry without a dismiss action', () => {
    hooks.useClusterMeetups.mockReturnValue({ data: [], isPending: false, isError: false })
    hooks.useMeetupState.mockReturnValue({ data: null, isPending: false, isError: false })
    renderCard()
    expect(screen.getByText('Propose a time')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dismiss meetup banner' })).toBeNull()
  })
})

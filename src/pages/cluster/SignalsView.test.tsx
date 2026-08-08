import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SignalsView } from './SignalsView'

const hooks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClusterMembers: vi.fn(),
  useClusterSignals: vi.fn(),
  useSignalReplies: vi.fn(),
  useRaiseSignal: vi.fn(),
  useAvatarUrl: vi.fn(),
}))

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useParams: () => ({ clusterId: 'c1' }) }
})
vi.mock('../../app/auth-context', () => ({ useAuth: hooks.useAuth }))
vi.mock('../../features/matching', () => ({ useClusterMembers: hooks.useClusterMembers }))
vi.mock('../../features/avatars', () => ({ useAvatarUrl: hooks.useAvatarUrl }))
vi.mock('../../features/signals', () => ({
  useClusterSignals: hooks.useClusterSignals,
  useSignalReplies: hooks.useSignalReplies,
  useRaiseSignal: hooks.useRaiseSignal,
}))

const members = [
  { id: 'm1', display_name: 'Bo', avatar_url: null },
  { id: 'u1', display_name: 'Ally', avatar_url: null },
]

const signal = {
  id: 's1',
  cluster_id: 'c1',
  author_id: 'm1',
  prompt: 'Can someone review my intro?',
  created_at: '2026-01-01T00:00:00Z',
  status: 'open',
  resolved_at: null,
  resolved_by: null,
}

const raise = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }

function renderPage() {
  return render(
    <MemoryRouter>
      <SignalsView />
    </MemoryRouter>,
  )
}

function queryStub(data: unknown) {
  return { data, isLoading: false, isError: false }
}

describe('SignalsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1' })
    hooks.useClusterMembers.mockReturnValue(queryStub(members))
    hooks.useClusterSignals.mockReturnValue(queryStub([]))
    hooks.useSignalReplies.mockReturnValue(queryStub([]))
    hooks.useRaiseSignal.mockReturnValue(raise)
    hooks.useAvatarUrl.mockReturnValue({ data: undefined })
  })

  it('shows the loading state while signals load', () => {
    hooks.useClusterSignals.mockReturnValue({ data: [], isLoading: true, isError: false })
    renderPage()
    expect(screen.getByText('Loading signals…')).toBeInTheDocument()
  })

  it('shows an empty state when there are no signals', () => {
    renderPage()
    expect(screen.getByText(/No signals yet/)).toBeInTheDocument()
  })

  it('lists active signals with status and author', () => {
    hooks.useClusterSignals.mockReturnValue(queryStub([signal]))
    renderPage()
    expect(screen.getByText('Can someone review my intro?')).toBeInTheDocument()
    expect(screen.getByText('Bo')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('0 replies')).toBeInTheDocument()
  })

  it('groups resolved signals in a collapsible section', () => {
    hooks.useClusterSignals.mockReturnValue(
      queryStub([{ ...signal, id: 's2', status: 'resolved', resolved_at: '2026-01-02T00:00:00Z' }]),
    )
    renderPage()
    expect(screen.getByText('Resolved (1)')).toBeInTheDocument()
    expect(screen.getByText('Can someone review my intro?')).toBeInTheDocument()
  })

  it('raises a new signal from the modal', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Raise a signal' }))
    const dialog = screen.getByRole('dialog', { name: 'Raise a signal' })
    fireEvent.change(within(dialog).getByPlaceholderText('What do you need help with?'), {
      target: { value: 'Need a second pair of eyes' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Raise signal' }))
    await waitFor(() => expect(raise.mutateAsync).toHaveBeenCalledWith('Need a second pair of eyes'))
  })

  it('surfaces an error when raising a signal fails', async () => {
    hooks.useRaiseSignal.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('nope')),
      isPending: false,
    })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Raise a signal' }))
    const dialog = screen.getByRole('dialog', { name: 'Raise a signal' })
    fireEvent.change(within(dialog).getByPlaceholderText('What do you need help with?'), {
      target: { value: 'Need help' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Raise signal' }))
    await waitFor(() =>
      expect(within(dialog).getByText('Something went wrong. Please try again.')).toBeInTheDocument(),
    )
  })
})

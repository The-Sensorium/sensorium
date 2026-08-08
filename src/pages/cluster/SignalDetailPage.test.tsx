import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SignalDetailPage } from './SignalDetailPage'

const hooks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useClusterMembers: vi.fn(),
  useClusterSignals: vi.fn(),
  useSignalReplies: vi.fn(),
  useReplySignal: vi.fn(),
  useSetSignalStatus: vi.fn(),
  useAvatarUrl: vi.fn(),
}))

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useParams: () => ({ clusterId: 'c1', signalId: 's1' }),
    useLocation: () => ({ key: 'default' }),
  }
})
vi.mock('../../app/auth-context', () => ({ useAuth: hooks.useAuth }))
vi.mock('../../features/matching', () => ({ useClusterMembers: hooks.useClusterMembers }))
vi.mock('../../features/avatars', () => ({ useAvatarUrl: hooks.useAvatarUrl }))
vi.mock('../../features/signals', () => ({
  useClusterSignals: hooks.useClusterSignals,
  useSignalReplies: hooks.useSignalReplies,
  useReplySignal: hooks.useReplySignal,
  useSetSignalStatus: hooks.useSetSignalStatus,
  SIGNAL_STATUS_ORDER: ['open', 'in_progress', 'resolved'],
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

const reply = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }
const setStatus = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }

function renderPage() {
  return render(
    <MemoryRouter>
      <SignalDetailPage />
    </MemoryRouter>,
  )
}

function queryStub(data: unknown) {
  return { data, isLoading: false, isError: false }
}

describe('SignalDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1' })
    hooks.useClusterMembers.mockReturnValue(queryStub(members))
    hooks.useClusterSignals.mockReturnValue(queryStub([signal]))
    hooks.useSignalReplies.mockReturnValue(queryStub([]))
    hooks.useReplySignal.mockReturnValue(reply)
    hooks.useSetSignalStatus.mockReturnValue(setStatus)
    hooks.useAvatarUrl.mockReturnValue({ data: undefined })
  })

  it('shows the loading state while signals load', () => {
    hooks.useClusterSignals.mockReturnValue({ data: [], isLoading: true, isError: false })
    hooks.useSignalReplies.mockReturnValue({ data: [], isLoading: true, isError: false })
    renderPage()
    expect(screen.getByText('Loading signal…')).toBeInTheDocument()
  })

  it('shows an unavailable message when the signal is missing', () => {
    hooks.useClusterSignals.mockReturnValue(queryStub([]))
    renderPage()
    expect(screen.getByText('This signal isn’t available.')).toBeInTheDocument()
  })

  it('renders the signal with a reply list and count', () => {
    hooks.useSignalReplies.mockReturnValue(
      queryStub([{ id: 'r1', signal_id: 's1', author_id: 'm1', content: 'On it!', created_at: '2026-01-01T01:00:00Z' }]),
    )
    renderPage()
    expect(screen.getByText('Can someone review my intro?')).toBeInTheDocument()
    expect(screen.getByText('1 reply')).toBeInTheDocument()
    expect(screen.getByText('On it!')).toBeInTheDocument()
    expect(screen.getAllByText('Bo').length).toBeGreaterThan(0)
  })

  it('shows the empty-replies message', () => {
    renderPage()
    expect(screen.getByText('No replies yet. Offer a hand below.')).toBeInTheDocument()
  })

  it('sends a reply', async () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('Offer a hand or share a thought…'), {
      target: { value: 'I can help' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    await waitFor(() => expect(reply.mutateAsync).toHaveBeenCalledWith('I can help'))
  })

  it('surfaces an error when the reply fails', async () => {
    hooks.useReplySignal.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('nope')),
      isPending: false,
    })
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('Offer a hand or share a thought…'), {
      target: { value: 'I can help' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument(),
    )
  })

  it('lets the raiser advance the status', async () => {
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'm1' })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Mark in progress' }))
    await waitFor(() =>
      expect(setStatus.mutateAsync).toHaveBeenCalledWith({ signalId: 's1', status: 'in_progress' }),
    )
  })

  it('hides the status button from non-raisers', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: 'Mark in progress' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).not.toBeInTheDocument()
  })

  it('surfaces an error when updating the status fails', async () => {
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'm1' })
    hooks.useSetSignalStatus.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('nope')),
      isPending: false,
    })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Mark in progress' }))
    await waitFor(() =>
      expect(screen.getByText('Something went wrong updating the status.')).toBeInTheDocument(),
    )
  })

  it('requires confirmation before resolving and calls the status mutation only on confirm', async () => {
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'm1' })
    hooks.useClusterSignals.mockReturnValue(queryStub([{ ...signal, status: 'in_progress' }]))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }))
    expect(setStatus.mutateAsync).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resolve' }))
    await waitFor(() =>
      expect(setStatus.mutateAsync).toHaveBeenCalledWith({ signalId: 's1', status: 'resolved' }),
    )
  })

  it('cancelling resolve keeps the status unchanged', () => {
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'm1' })
    hooks.useClusterSignals.mockReturnValue(queryStub([{ ...signal, status: 'in_progress' }]))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(setStatus.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Mark resolved' })).toBeInTheDocument()
  })

  it('keeps the confirm state and shows an error when resolving fails', async () => {
    hooks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'm1' })
    hooks.useClusterSignals.mockReturnValue(queryStub([{ ...signal, status: 'in_progress' }]))
    hooks.useSetSignalStatus.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('nope')),
      isPending: false,
    })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resolve' }))
    await waitFor(() =>
      expect(screen.getByText('Something went wrong updating the status.')).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Confirm resolve' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Something went wrong updating the status.')).not.toBeInTheDocument()
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppealPage } from './AppealPage'

const hooks = vi.hoisted(() => ({
  useMyAccess: vi.fn(),
  useMyAppeal: vi.fn(),
  useSubmitAppeal: vi.fn(),
}))

vi.mock('../features/access', () => ({ useMyAccess: hooks.useMyAccess }))
vi.mock('../features/appeals', () => ({
  useMyAppeal: hooks.useMyAppeal,
  useSubmitAppeal: hooks.useSubmitAppeal,
  APPEAL_STATUS_LABELS: { submitted: 'Under review', resolved: 'Resolved' },
}))
vi.mock('../features/notifications', () => ({
  timeAgo: () => 'just now',
}))

const accessSuspended = {
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  data: { account_status: 'suspended', restriction_expires_at: '2026-09-01T00:00:00Z' },
}

const accessBanned = {
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  data: { account_status: 'banned', restriction_expires_at: null },
}

const accessActive = {
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  data: { account_status: 'active', restriction_expires_at: null },
}

const submit = { mutateAsync: vi.fn().mockResolvedValue('id-1'), isPending: false }

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AppealPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppealPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useMyAccess.mockReturnValue(accessSuspended)
    hooks.useMyAppeal.mockReturnValue({ data: [], isLoading: false, isError: false })
    hooks.useSubmitAppeal.mockReturnValue(submit)
  })

  it('shows the appeal form for a restricted account with no appeal', () => {
    renderPage()
    expect(screen.getByText('Appeal a decision')).toBeInTheDocument()
    expect(screen.getByLabelText('Why should this be reconsidered?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit appeal' })).toBeInTheDocument()
  })

  it('disables the submit button while details are empty', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Submit appeal' })).toBeDisabled()
  })

  it('submits the appeal and shows a success message', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Why should this be reconsidered?'), {
      target: { value: 'I was incorrectly suspended.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit appeal' }))
    await waitFor(() => expect(submit.mutateAsync).toHaveBeenCalledWith('I was incorrectly suspended.'))
    expect(await screen.findByText(/Your appeal has been submitted/)).toBeInTheDocument()
  })

  it('surfaces a friendly error when the account is no longer restricted', async () => {
    hooks.useSubmitAppeal.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('account_not_restricted')),
      isPending: false,
    })
    renderPage()
    fireEvent.change(screen.getByLabelText('Why should this be reconsidered?'), {
      target: { value: 'Hello.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit appeal' }))
    expect(await screen.findByText(/Your account is not restricted/)).toBeInTheDocument()
  })

  it('shows the appeal status when one exists', () => {
    hooks.useMyAppeal.mockReturnValue({
      data: [
        {
          id: 'a1',
          appealed_status: 'suspended',
          appealed_reason: 'spam',
          appealed_expires_at: null,
          details: 'I am innocent.',
          status: 'submitted',
          response: null,
          created_at: '2026-08-01T00:00:00Z',
          decided_at: null,
        },
      ],
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('Under review')).toBeInTheDocument()
    expect(screen.getByText('I am innocent.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit appeal' })).not.toBeInTheDocument()
  })

  it('shows the resolved outcome and lets a restricted account re-appeal', () => {
    hooks.useMyAccess.mockReturnValue(accessBanned)
    hooks.useMyAppeal.mockReturnValue({
      data: [
        {
          id: 'a1',
          appealed_status: 'suspended',
          appealed_reason: 'spam',
          appealed_expires_at: null,
          details: 'I am innocent.',
          status: 'resolved',
          response: 'After review, the suspension was a mistake.',
          created_at: '2026-08-01T00:00:00Z',
          decided_at: '2026-08-02T00:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('Previous outcome')).toBeInTheDocument()
    expect(screen.getByText('After review, the suspension was a mistake.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit appeal' })).toBeInTheDocument()
  })
})

describe('AppealPage redirect safety', () => {
  it('renders an empty-state note for an active account without forthcoming access assumptions', () => {
    hooks.useMyAccess.mockReturnValue(accessActive)
    renderPage()
    expect(screen.getByText('Appeal a decision')).toBeInTheDocument()
    expect(screen.getByText(/your account/)).toBeInTheDocument()
  })
})
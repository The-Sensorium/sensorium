import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminAppealCasePage } from './AdminAppealCasePage'

const hooks = vi.hoisted(() => ({
  useAdminAppeal: vi.fn(),
  useDecideAppeal: vi.fn(),
}))

vi.mock('../../features/appeals', () => ({
  useAdminAppeal: hooks.useAdminAppeal,
  useDecideAppeal: hooks.useDecideAppeal,
  APPEAL_STATUS_LABELS: { submitted: 'Under review', resolved: 'Resolved' },
}))
vi.mock('../../features/admin-moderation', () => ({
  formatError: (e: unknown) => (e instanceof Error ? e.message : 'Unknown error'),
}))
vi.mock('../../features/notifications', () => ({
  timeAgo: () => 'just now',
}))

const openAppeal = {
  id: 'ap-1',
  user_id: 'u-1',
  display_name: 'Nadia',
  appealed_status: 'suspended',
  appealed_reason: 'spam',
  appealed_expires_at: '2026-09-01T00:00:00Z',
  details: 'I did not spam anyone.',
  status: 'submitted',
  response: null,
  created_at: '2026-08-01T00:00:00Z',
  decided_at: null,
  current_account_status: 'suspended',
  current_restriction_reason: 'spam',
  current_restriction_expires_at: '2026-09-01T00:00:00Z',
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/admin/appeals/ap-1']}>
        <Routes>
          <Route path="/admin/appeals/:appealId" element={<AdminAppealCasePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// The submit button shares its label with the choice toggle; only the submit
// button lacks aria-pressed.
function submitButton(name: string): HTMLButtonElement {
  const matches = screen.getAllByRole('button', { name })
  const submit = matches.find((el) => !el.hasAttribute('aria-pressed'))
  if (!submit) throw new Error(`No submit button named "${name}"`)
  return submit as HTMLButtonElement
}

function toggleButton(name: string): HTMLButtonElement {
  const matches = screen.getAllByRole('button', { name })
  const toggle = matches.find((el) => el.hasAttribute('aria-pressed'))
  if (!toggle) throw new Error(`No toggle button named "${name}"`)
  return toggle as HTMLButtonElement
}

describe('AdminAppealCasePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useAdminAppeal.mockReturnValue({ data: openAppeal, isLoading: false, isError: false, refetch: vi.fn() })
    hooks.useDecideAppeal.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false })
  })

  it('renders the case details and the appellant’s words', () => {
    renderPage()
    expect(screen.getByText('Appeal case')).toBeInTheDocument()
    expect(screen.getByText(/Nadia appealed a suspended decision/)).toBeInTheDocument()
    expect(screen.getByText('I did not spam anyone.')).toBeInTheDocument()
    expect(screen.getAllByText('spam').length).toBeGreaterThan(0)
  })

  it('shows a spinner while loading', () => {
    hooks.useAdminAppeal.mockReturnValue({ data: null, isLoading: true, isError: false, refetch: vi.fn() })
    const { container } = renderPage()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('shows an error state with a retry button', () => {
    hooks.useAdminAppeal.mockReturnValue({ data: null, isLoading: false, isError: true, refetch: vi.fn() })
    renderPage()
    expect(screen.getByText('Could not load this appeal.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
  })

  it('keeps the decision button disabled until choice and response are set', () => {
    renderPage()
    const submit = submitButton('Reject appeal')
    expect(submit).toBeDisabled()
    fireEvent.click(toggleButton('Grant appeal'))
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Response for the appellant/), { target: { value: 'We restored you.' } })
    expect(submit).toBeEnabled()
  })

  it('grants the appeal and shows the success message', async () => {
    const decide = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }
    hooks.useDecideAppeal.mockReturnValue(decide)
    renderPage()
    fireEvent.click(toggleButton('Grant appeal'))
    fireEvent.change(screen.getByLabelText(/Response for the appellant/), { target: { value: 'We restored you.' } })
    fireEvent.click(submitButton('Grant appeal'))
    await waitFor(() =>
      expect(decide.mutateAsync).toHaveBeenCalledWith({
        p_appeal_id: 'ap-1',
        p_accept: true,
        p_response: 'We restored you.',
      }),
    )
    expect(await screen.findByText(/Appeal granted/)).toBeInTheDocument()
  })

  it('surfaces an error when the decision fails', async () => {
    hooks.useDecideAppeal.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('appeal_already_resolved')),
      isPending: false,
    })
    renderPage()
    fireEvent.click(toggleButton('Grant appeal'))
    fireEvent.change(screen.getByLabelText(/Response for the appellant/), { target: { value: 'Late reply.' } })
    fireEvent.click(submitButton('Grant appeal'))
    expect(await screen.findByText('appeal_already_resolved')).toBeInTheDocument()
  })

  it('shows the resolved state and recorded response when the appeal is closed', () => {
    hooks.useAdminAppeal.mockReturnValue({
      data: { ...openAppeal, status: 'resolved', response: 'After review, you were right.', current_account_status: 'active' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText(/This appeal is resolved/)).toBeInTheDocument()
    expect(screen.getByText(/After review, you were right./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Grant appeal' })).not.toBeInTheDocument()
  })
})
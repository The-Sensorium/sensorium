import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminAppealsPage } from './AdminAppealsPage'

const hooks = vi.hoisted(() => ({
  useAdminAppeals: vi.fn(),
}))

vi.mock('../../features/appeals', () => ({
  useAdminAppeals: hooks.useAdminAppeals,
  APPEAL_STATUS_LABELS: { submitted: 'Under review', resolved: 'Resolved' },
}))
vi.mock('../../features/notifications', () => ({
  timeAgo: () => 'just now',
  useMarkStaffNotificationsRead: () => ({ mutate: vi.fn() }),
  useStaffUnreadCounts: () => ({ data: { reports: 0, appeals: 0 } }),
}))

const row = {
  id: 'ap-1',
  user_id: 'u-1',
  display_name: 'Nadia',
  appealed_status: 'suspended',
  appealed_reason: 'spam',
  details: 'I did not spam anyone.',
  status: 'submitted',
  response: null,
  created_at: '2026-08-01T00:00:00Z',
  decided_at: null,
}

function makeQueue(data: unknown[] = [row]) {
  return { data, isLoading: false, isError: false, refetch: vi.fn() }
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AdminAppealsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminAppealsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useAdminAppeals.mockReturnValue(makeQueue())
  })

  it('renders the appeal queue with member details', () => {
    renderPage()
    expect(screen.getByText('Appeals')).toBeInTheDocument()
    expect(screen.getByText('Nadia')).toBeInTheDocument()
    expect(screen.getByText('I did not spam anyone.')).toBeInTheDocument()
    expect(screen.getAllByText('Under review').length).toBeGreaterThan(0)
  })

  it('links each appeal to its case page', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /Nadia/ })).toHaveAttribute('href', '/ap-1')
  })

  it('switches the status filter and resets the page', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }))
    await waitFor(() =>
      expect(hooks.useAdminAppeals).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'resolved', page: 1 }),
      ),
    )
    expect(screen.getByRole('button', { name: 'Resolved' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the empty state when there are no appeals', () => {
    hooks.useAdminAppeals.mockReturnValue(makeQueue([]))
    renderPage()
    expect(screen.getByText(/no .* appeals right now/i)).toBeInTheDocument()
  })

  it('shows a spinner while loading', () => {
    hooks.useAdminAppeals.mockReturnValue({ data: [], isLoading: true, isError: false, refetch: vi.fn() })
    const { container } = renderPage()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('shows an error state with a retry button', () => {
    hooks.useAdminAppeals.mockReturnValue({ data: [], isLoading: false, isError: true, refetch: vi.fn() })
    renderPage()
    expect(screen.getByText(/Couldn’t load the appeal queue/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
  })

  it('pages forward when more rows remain', () => {
    hooks.useAdminAppeals.mockReturnValue(makeQueue(Array.from({ length: 25 }, (_, i) => ({ ...row, id: `ap-${i}` }))))
    renderPage()
    const next = screen.getByRole('button', { name: 'Next' })
    expect(next).not.toBeDisabled()
    fireEvent.click(next)
    expect(hooks.useAdminAppeals).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })
})
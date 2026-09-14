import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminAppealsPage } from './AdminAppealsPage'

const hooks = vi.hoisted(() => ({
  useAppealsPageV2: vi.fn(),
  useClaimAppeal: vi.fn(),
}))

vi.mock('../../features/appeals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/appeals')>()
  return {
    ...actual,
    useAppealsPageV2: hooks.useAppealsPageV2,
    useClaimAppeal: hooks.useClaimAppeal,
  }
})
vi.mock('../../features/admin-moderation', () => ({
  formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
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
  snippet: 'I did not spam anyone.',
  status: 'submitted',
  created_at: '2026-08-01T00:00:00Z',
  decided_at: null,
  assigned_to: null,
  assigned_to_display_name: null,
  review_due_at: null,
}

function makeQueue(pages: unknown[][] = [[row]]) {
  return {
    data: { pages },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }
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
    hooks.useAppealsPageV2.mockReturnValue(makeQueue())
    hooks.useClaimAppeal.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
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

  it('switches tabs and passes assignment filters', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Assigned to me' }))
    await waitFor(() =>
      expect(hooks.useAppealsPageV2).toHaveBeenLastCalledWith(
        expect.objectContaining({ assignee: 'mine' }),
      ),
    )
    expect(screen.getByRole('button', { name: 'Assigned to me' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('flags overdue appeals', () => {
    hooks.useAppealsPageV2.mockReturnValue(
      makeQueue([[{ ...row, review_due_at: '2020-01-01T00:00:00Z' }]]),
    )
    renderPage()
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(1)
  })

  it('shows the empty state when there are no appeals', () => {
    hooks.useAppealsPageV2.mockReturnValue(makeQueue([[]]))
    renderPage()
    expect(screen.getByText(/no appeals match this view/i)).toBeInTheDocument()
  })

  it('shows a spinner while loading', () => {
    hooks.useAppealsPageV2.mockReturnValue({ ...makeQueue(), data: undefined, isLoading: true })
    const { container } = renderPage()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('shows an error state with a retry button', () => {
    hooks.useAppealsPageV2.mockReturnValue({ ...makeQueue(), data: undefined, isLoading: false, isError: true })
    renderPage()
    expect(screen.getByText(/Couldn’t load the appeal queue/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
  })

  it('claims an unassigned appeal', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    hooks.useClaimAppeal.mockReturnValue({ mutateAsync, isPending: false })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Claim' }))
    expect(mutateAsync).toHaveBeenCalledWith({ p_appeal_id: 'ap-1' })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('claimed successfully'))
  })
})

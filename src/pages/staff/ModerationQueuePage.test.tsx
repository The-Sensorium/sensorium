import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModerationQueuePage } from './ModerationQueuePage'

const hooks = vi.hoisted(() => ({
  useModerationQueueV2: vi.fn(),
  useClaimReport: vi.fn(),
}))

vi.mock('../../features/admin-moderation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/admin-moderation')>()
  return {
    ...actual,
    useModerationQueueV2: hooks.useModerationQueueV2,
    useClaimReport: hooks.useClaimReport,
  }
})
vi.mock('../../features/notifications', () => ({
  timeAgo: () => 'just now',
  useMarkStaffNotificationsRead: () => ({ mutate: vi.fn() }),
  useStaffUnreadCounts: () => ({ data: { reports: 0, appeals: 0 } }),
}))

function makeQueue(pages: unknown[][] = [[]]) {
  return {
    data: { pages },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: false,
  }
}

function renderPage(entry: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <ModerationQueuePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ModerationQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useModerationQueueV2.mockReturnValue(makeQueue())
    hooks.useClaimReport.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  })

  it('sanitizes tampered URL filters instead of sending them to the RPC', async () => {
    renderPage('/reports?status=bogus&severity=bogus&reason=bogus&target_kind=bogus&assignee=not-a-uuid&sla=bogus&order=sideways')
    await waitFor(() =>
      expect(hooks.useModerationQueueV2).toHaveBeenCalledWith(
        expect.objectContaining({
          status: undefined,
          severity: undefined,
          reason: undefined,
          targetKind: undefined,
          assignee: 'all',
          sla: 'open',
          order: 'desc',
        }),
      ),
    )
    expect(screen.getByText(/No reports match these filters/)).toBeInTheDocument()
  })

  it('passes valid URL filters through to the RPC', async () => {
    renderPage('/reports?status=reviewing&severity=high&reason=spam&target_kind=post&sla=breached&order=asc')
    await waitFor(() =>
      expect(hooks.useModerationQueueV2).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'reviewing',
          severity: 'high',
          reason: 'spam',
          targetKind: 'post',
          sla: 'breached',
          order: 'asc',
        }),
      ),
    )
  })

  it('shows the empty state when no rows match', () => {
    renderPage('/reports')
    expect(screen.getByText(/No reports match these filters/)).toBeInTheDocument()
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StaffDashboardPage } from './StaffDashboardPage'

const hooks = vi.hoisted(() => ({
  useStaffModerationSummary: vi.fn(),
  useModerationQueueV2: vi.fn(),
  useAdminOpsHealth: vi.fn(),
  useMyAccess: vi.fn(),
}))

vi.mock('../../features/admin-moderation', () => ({
  useStaffModerationSummary: hooks.useStaffModerationSummary,
  useModerationQueueV2: hooks.useModerationQueueV2,
  useAdminOpsHealth: hooks.useAdminOpsHealth,
}))

vi.mock('../../features/access', () => ({
  useMyAccess: hooks.useMyAccess,
}))

vi.mock('../../features/notifications', () => ({
  timeAgo: () => '2h ago',
}))

const health = {
  email_queued: 3,
  email_stuck_sending: 0,
  email_failed_24h: 1,
  email_abandoned: 0,
  push_queued: 0,
  push_stuck_sending: 0,
  push_failed_24h: 0,
  push_abandoned: 0,
  reports_breached_open: 1,
  appeals_overdue_open: 0,
  last_email_pump_at: '2026-08-01T00:00:00Z',
  last_push_pump_at: null,
  last_sla_watch_at: null,
}

const summary = {
  pending_count: 3,
  reviewing_count: 1,
  assigned_to_me_count: 2,
  unassigned_open_count: 2,
  oldest_pending_at: '2026-08-01T00:00:00Z',
  breached_open_count: 1,
  urgent_open_count: 1,
  actioned_7d_count: 4,
  dismissed_7d_count: 2,
  appeals_submitted_count: 1,
  reports_by_reason: { harassment: 2, spam: 2 },
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <StaffDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('StaffDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useStaffModerationSummary.mockReturnValue({ data: summary, isLoading: false, isError: false, refetch: vi.fn() })
    hooks.useModerationQueueV2.mockReturnValue({ data: { pages: [[]] }, isLoading: false })
    hooks.useMyAccess.mockReturnValue({ data: { capabilities: [] } })
    hooks.useAdminOpsHealth.mockReturnValue({ data: null, isLoading: false, isError: false, refetch: vi.fn() })
  })

  it('renders operational counts with links into the queue', () => {
    renderPage()
    expect(screen.getByText('Staff dashboard')).toBeInTheDocument()
    expect(document.querySelector('[data-e2e="staff-stat-pending"]')).not.toBeNull()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('shows the empty urgent state', () => {
    renderPage()
    expect(screen.getByText('No urgent open cases.')).toBeInTheDocument()
  })

  it('shows an urgent error state with retry instead of the empty state', () => {
    hooks.useModerationQueueV2.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() })
    renderPage()
    expect(screen.getByText(/Couldn’t load urgent cases/)).toBeInTheDocument()
    expect(screen.queryByText('No urgent open cases.')).not.toBeInTheDocument()
  })

  it('hides operations health from non-admins', () => {
    renderPage()
    expect(screen.queryByText('Operations health')).not.toBeInTheDocument()
  })

  it('shows operations health to admins with failure highlights', () => {
    hooks.useMyAccess.mockReturnValue({ data: { capabilities: ['can_manage_roles'] } })
    hooks.useAdminOpsHealth.mockReturnValue({ data: health, isLoading: false, isError: false, refetch: vi.fn() })
    renderPage()
    expect(screen.getByText('Operations health')).toBeInTheDocument()
    expect(screen.getByText('Emails failed · 24h')).toBeInTheDocument()
  })

  it('warns about stuck or abandoned deliveries', () => {
    hooks.useMyAccess.mockReturnValue({ data: { capabilities: ['can_manage_roles'] } })
    hooks.useAdminOpsHealth.mockReturnValue({
      data: { ...health, email_stuck_sending: 2 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Stuck or abandoned')
  })

  it('lists urgent cases', () => {
    hooks.useModerationQueueV2.mockReturnValue({
      data: { pages: [[{ id: 'r-1', reason: 'harassment', target_display_name: 'Nadia', created_at: '2026-08-01T00:00:00Z' }]] },
      isLoading: false,
    })
    renderPage()
    expect(screen.getByText(/harassment/)).toBeInTheDocument()
  })

  it('shows a spinner while loading', () => {
    hooks.useStaffModerationSummary.mockReturnValue({ data: null, isLoading: true, isError: false, refetch: vi.fn() })
    const { container } = renderPage()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('shows an error state with retry', () => {
    hooks.useStaffModerationSummary.mockReturnValue({ data: null, isLoading: false, isError: true, refetch: vi.fn() })
    renderPage()
    expect(screen.getByText(/Couldn’t load the dashboard/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
  })
})

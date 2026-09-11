import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountDetailPage } from './AccountDetailPage'

const hooks = vi.hoisted(() => ({
  useStaffAccountDetail: vi.fn(),
  useAccountHistory: vi.fn(),
  useLiftRestriction: vi.fn(),
  useMyAccess: vi.fn(),
}))

vi.mock('../../features/admin-accounts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/admin-accounts')>()
  return {
    ...actual,
    useStaffAccountDetail: hooks.useStaffAccountDetail,
    useAccountHistory: hooks.useAccountHistory,
    useLiftRestriction: hooks.useLiftRestriction,
    useStaffBase: () => '/admin',
  }
})
vi.mock('../../features/access', () => ({
  useMyAccess: hooks.useMyAccess,
}))
vi.mock('../../features/notifications', () => ({
  timeAgo: () => 'just now',
}))
vi.mock('../../features/admin-moderation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/admin-moderation')>()
  return { ...actual, formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)) }
})

const detail = {
  user_id: 'u-1',
  display_name: 'Rio Mendez',
  email: null,
  account_created_at: '2025-01-01T00:00:00Z',
  account_status: 'suspended',
  restriction_expires_at: null,
  restriction_reason: 'spam wave',
  roles: [],
  cluster_names: ['Aurora'],
  open_reports_against: 1,
  total_reports_against: 2,
  reports_filed: 0,
  enforcement_count: 1,
  appeals_count: 0,
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/admin/accounts/u-1']}>
        <Routes>
          <Route path="/admin/accounts/:userId" element={<AccountDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AccountDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useStaffAccountDetail.mockReturnValue({ data: detail, isLoading: false, isError: false, refetch: vi.fn() })
    hooks.useAccountHistory.mockReturnValue({ data: { pages: [[]] }, isLoading: false, isError: false, refetch: vi.fn(), hasNextPage: false })
    hooks.useLiftRestriction.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    hooks.useMyAccess.mockReturnValue({ data: { capabilities: ['can_moderate', 'can_apply_temporary_restriction'], user_id: 'me' } })
  })

  it('renders the restriction banner with lift action', () => {
    renderPage()
    expect(screen.getByText('Rio Mendez')).toBeInTheDocument()
    expect(screen.getByText(/spam wave/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lift restriction' })).toBeInTheDocument()
  })

  it('shows summary counts and history entries', () => {
    hooks.useAccountHistory.mockReturnValue({
      data: { pages: [[{ entry_id: 'h-1', kind: 'report', created_at: '', summary: 'against · spam · pending', status: 'pending', report_id: 'r-1', appeal_id: null }]] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      hasNextPage: false,
    })
    renderPage()
    expect(screen.getByText('Against')).toBeInTheDocument()
    expect(screen.getByText('spam · pending')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open case' })).toHaveAttribute('href', '/admin/reports/r-1')
  })

  it('drops a head segment that repeats the kind', () => {
    hooks.useAccountHistory.mockReturnValue({
      data: { pages: [[{ entry_id: 'h-2', kind: 'appeal', created_at: '', summary: 'appeal · submitted', status: 'submitted', report_id: null, appeal_id: 'a-1' }]] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      hasNextPage: false,
    })
    hooks.useMyAccess.mockReturnValue({ data: { capabilities: ['can_moderate', 'can_manage_roles'], user_id: 'me' } })
    renderPage()
    expect(screen.getByText('Submitted')).toBeInTheDocument()
    expect(screen.queryByText('Appeal appeal')).not.toBeInTheDocument()
  })

  it('hides lift for banned accounts when the viewer is not an admin', () => {
    hooks.useStaffAccountDetail.mockReturnValue({
      data: { ...detail, account_status: 'banned' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.queryByRole('button', { name: 'Lift restriction' })).not.toBeInTheDocument()
    expect(screen.getByText('Only an admin can lift a permanent ban.')).toBeInTheDocument()
  })

  it('lifts through confirm with a reason', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    hooks.useLiftRestriction.mockReturnValue({ mutateAsync, isPending: false })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Lift restriction' }))
    fireEvent.change(screen.getByLabelText('Lift reason'), { target: { value: 'Served time' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm lift' }))
    expect(mutateAsync).toHaveBeenCalledWith({ p_user_id: 'u-1', p_reason: 'Served time' })
  })

  it('shows email when the backend returns it', () => {
    hooks.useStaffAccountDetail.mockReturnValue({
      data: { ...detail, email: 'rio@example.com' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText(/rio@example.com/)).toBeInTheDocument()
  })
})

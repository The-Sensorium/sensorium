import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModerationAuditPage } from './ModerationAuditPage'

const hooks = vi.hoisted(() => ({
  useModerationAuditV2: vi.fn(),
}))

vi.mock('../../features/admin-moderation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/admin-moderation')>()
  return { ...actual, useModerationAuditV2: hooks.useModerationAuditV2 }
})
vi.mock('../../features/notifications', () => ({
  timeAgo: () => 'just now',
}))

const row = {
  id: 'a-1',
  created_at: '2026-08-01T00:00:00Z',
  actor_id: 'mod-1',
  actor_display_name: 'Mara',
  target_user_id: 'u-1',
  target_display_name: 'Rio',
  report_id: 'r-1',
  message_id: null,
  post_id: null,
  comment_id: null,
  appeal_id: null,
  action: 'warning_issued',
  reason: 'spam warning',
  metadata: { type: 'warning' },
  policy_code: 'spam',
}

function makeAudit(pages: unknown[][] = [[row]]) {
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
      <MemoryRouter initialEntries={['/admin/audit']}>
        <ModerationAuditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ModerationAuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useModerationAuditV2.mockReturnValue(makeAudit())
  })

  it('renders rows with humanized actions', () => {
    renderPage()
    expect(screen.getByText('Moderation audit')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /warning issued/i })).toBeInTheDocument()
  })

  it('passes server filters for action and search', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'warning_issued' } })
    expect(hooks.useModerationAuditV2).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'warning_issued' }),
      100,
    )
  })

  it('opens a detail drawer with metadata and links', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /warning issued/i }))
    expect(screen.getByRole('dialog', { name: 'Audit entry details' })).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('warning')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open case' })).toHaveAttribute('href', '/admin/reports/r-1')
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the stored policy code in the drawer', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /warning issued/i }))
    expect(screen.getByText('Policy')).toBeInTheDocument()
    expect(screen.getByText('spam')).toBeInTheDocument()
  })

  it('hides the policy row when no policy was stored', () => {
    hooks.useModerationAuditV2.mockReturnValue(makeAudit([[{ ...row, policy_code: null }]]))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /warning issued/i }))
    expect(screen.queryByText('Policy')).not.toBeInTheDocument()
  })

  it('shows the empty state when filters match nothing', () => {
    hooks.useModerationAuditV2.mockReturnValue(makeAudit([[]]))
    renderPage()
    expect(screen.getByText(/No entries match these filters/)).toBeInTheDocument()
  })

  it('shows an error state with retry', () => {
    hooks.useModerationAuditV2.mockReturnValue({ ...makeAudit(), data: undefined, isLoading: false, isError: true })
    renderPage()
    expect(screen.getByText(/Couldn’t load the audit log/)).toBeInTheDocument()
  })
})

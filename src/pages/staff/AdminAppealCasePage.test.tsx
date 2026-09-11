import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminAppealCasePage } from './AdminAppealCasePage'

const hooks = vi.hoisted(() => ({
  useAdminAppealV2: vi.fn(),
  useClaimAppeal: vi.fn(),
  useReleaseAppeal: vi.fn(),
  useAssignAppeal: vi.fn(),
  useAddAppealNote: vi.fn(),
  useRequestSecondReview: vi.fn(),
  useDecideAppeal: vi.fn(),
  useMyAccess: vi.fn(),
  useStaffAccountSearch: vi.fn(),
}))

vi.mock('../../features/appeals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/appeals')>()
  return {
    ...actual,
    useAdminAppealV2: hooks.useAdminAppealV2,
    useClaimAppeal: hooks.useClaimAppeal,
    useReleaseAppeal: hooks.useReleaseAppeal,
    useAssignAppeal: hooks.useAssignAppeal,
    useAddAppealNote: hooks.useAddAppealNote,
    useRequestSecondReview: hooks.useRequestSecondReview,
    useDecideAppeal: hooks.useDecideAppeal,
  }
})
vi.mock('../../features/admin-moderation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/admin-moderation')>()
  return {
    ...actual,
    formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
    useModerationPolicies: () => ({ data: [], isLoading: false, isError: false }),
  }
})
vi.mock('../../features/admin-accounts', () => ({
  useStaffAccountSearch: hooks.useStaffAccountSearch,
}))
vi.mock('../../features/access', () => ({
  useMyAccess: hooks.useMyAccess,
}))
vi.mock('../../features/notifications', () => ({
  timeAgo: () => 'just now',
  timeUntil: () => 'in 3 days',
}))

const openAppeal = {
  id: 'ap-1',
  user_id: 'u-1',
  display_name: 'Nadia',
  appealed_status: 'suspended',
  appealed_reason: 'spam',
  appealed_expires_at: null,
  details: 'I did not spam anyone.',
  status: 'submitted',
  response: null,
  created_at: '2026-08-01T00:00:00Z',
  decided_at: null,
  decided_by: null,
  assigned_to: null,
  assigned_to_display_name: null,
  review_due_at: null,
  internal_note: null,
  decision_reason_code: null,
  second_review_requested_by: null,
  second_review_requested_at: null,
  original_action: null,
  original_report_id: null,
  appellant: {
    account_status: 'suspended',
    restriction_expires_at: null,
    restriction_reason: 'spam',
    roles: [],
    cluster_names: ['Aurora'],
    prior_reports: 1,
    prior_actions: 1,
  },
  recent_reports: [],
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
    hooks.useAdminAppealV2.mockReturnValue({ data: openAppeal, isLoading: false, isError: false, refetch: vi.fn() })
    hooks.useDecideAppeal.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false })
    hooks.useClaimAppeal.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    hooks.useReleaseAppeal.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    hooks.useAssignAppeal.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    hooks.useAddAppealNote.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    hooks.useRequestSecondReview.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    hooks.useMyAccess.mockReturnValue({ data: { user_id: 'me', capabilities: [] } })
    hooks.useStaffAccountSearch.mockReturnValue({ data: [] })
  })

  it('renders the case details and the appellant’s words', () => {
    renderPage()
    expect(screen.getByText('Appeal case')).toBeInTheDocument()
    expect(screen.getByText(/Nadia appealed a suspended decision/)).toBeInTheDocument()
    expect(screen.getByText('I did not spam anyone.')).toBeInTheDocument()
  })

  it('shows appellant context with an account link', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Nadia' })).toHaveAttribute('href', '/admin/accounts/u-1')
  })

  it('shows a spinner while loading', () => {
    hooks.useAdminAppealV2.mockReturnValue({ data: null, isLoading: true, isError: false, refetch: vi.fn() })
    const { container } = renderPage()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('shows an error state with a retry button', () => {
    hooks.useAdminAppealV2.mockReturnValue({ data: null, isLoading: false, isError: true, refetch: vi.fn() })
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
        p_internal_note: undefined,
        p_decision_reason_code: undefined,
        p_second_review_confirmed: false,
      }),
    )
    expect(await screen.findByText(/Appeal granted/)).toBeInTheDocument()
  })

  it('requires a second review before rejecting a ban appeal', () => {
    hooks.useAdminAppealV2.mockReturnValue({
      data: { ...openAppeal, appealed_status: 'banned' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    renderPage()
    fireEvent.click(toggleButton('Reject appeal'))
    expect(screen.getByRole('button', { name: 'Request second review' })).toBeInTheDocument()
  })

  it('saves an internal note separately from the response', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    hooks.useAddAppealNote.mockReturnValue({ mutateAsync, isPending: false })
    renderPage()
    fireEvent.change(screen.getByLabelText('Appeal internal note'), { target: { value: 'Needs context' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
    expect(mutateAsync).toHaveBeenCalledWith({ p_appeal_id: 'ap-1', p_note: 'Needs context' })
  })

  it('shows the resolved state and recorded response when the appeal is closed', () => {
    hooks.useAdminAppealV2.mockReturnValue({
      data: { ...openAppeal, status: 'resolved', response: 'After review, you were right.' },
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

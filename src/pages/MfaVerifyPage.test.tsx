import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MfaVerifyPage } from './MfaVerifyPage'

const hooks = vi.hoisted(() => ({
  useMfaStatus: vi.fn(),
  useQueryClient: vi.fn(),
}))

vi.mock('react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigated">{to}</div>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: hooks.useQueryClient }))
vi.mock('../features/staff-mfa', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/staff-mfa')>()),
  useMfaStatus: hooks.useMfaStatus,
}))

describe('MfaVerifyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useQueryClient.mockReturnValue({ invalidateQueries: vi.fn(), refetchQueries: vi.fn() })
  })

  it('keeps the spinner between retry attempts instead of bouncing to /entry', () => {
    hooks.useMfaStatus.mockReturnValue({
      data: undefined,
      error: null,
      isPending: true,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    const { container } = render(<MfaVerifyPage />)
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    expect(screen.queryByTestId('navigated')).not.toBeInTheDocument()
    expect(screen.queryByText('Check your authenticator')).not.toBeInTheDocument()
  })

  it('routes to /entry once the status resolves as not needing verification', () => {
    hooks.useMfaStatus.mockReturnValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1', verifiedTotpCount: 0, verifiedTotpIds: [] },
      error: null,
      isPending: false,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<MfaVerifyPage />)
    expect(screen.getByTestId('navigated')).toHaveTextContent('/entry')
  })

  it('renders the form when verification is needed', () => {
    hooks.useMfaStatus.mockReturnValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2', verifiedTotpCount: 1, verifiedTotpIds: ['f1'] },
      error: null,
      isPending: false,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<MfaVerifyPage />)
    expect(screen.getByText('Check your authenticator')).toBeInTheDocument()
    expect(screen.queryByTestId('navigated')).not.toBeInTheDocument()
  })
})

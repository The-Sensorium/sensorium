import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MfaSetupPage } from './MfaSetupPage'
import { MfaVerifyPage } from './MfaVerifyPage'

const mocks = vi.hoisted(() => ({
  isMobileDevice: vi.fn(),
  useMfaStatus: vi.fn(),
  useAuth: vi.fn(),
}))

vi.mock('../lib/device', () => ({ isMobileDevice: mocks.isMobileDevice }))
vi.mock('../features/staff-mfa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/staff-mfa')>()
  return { ...actual, useMfaStatus: mocks.useMfaStatus }
})
vi.mock('../app/auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/auth-context')>()
  return { ...actual, useAuth: mocks.useAuth }
})

function renderAt(path: string, ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/home" element={<div>home page</div>} />
          <Route path="/entry" element={<div>entry page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('staff two-step mobile guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useAuth.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' })
    mocks.useMfaStatus.mockReturnValue({ data: null, isLoading: false, isError: false, refetch: vi.fn() })
  })

  it('bounces /mfa-setup to home on mobile', () => {
    mocks.isMobileDevice.mockReturnValue(true)
    const { container } = renderAt('/mfa-setup', <MfaSetupPage />)
    expect(screen.getByText('home page')).toBeInTheDocument()
    expect(container.querySelector('[data-e2e="mfa-setup"]')).toBeNull()
  })

  it('keeps /mfa-setup on desktop', () => {
    mocks.isMobileDevice.mockReturnValue(false)
    const { container } = renderAt('/mfa-setup', <MfaSetupPage />)
    expect(container.querySelector('[data-e2e="mfa-setup"]')).not.toBeNull()
  })

  it('bounces /mfa-verify to home on mobile', () => {
    mocks.isMobileDevice.mockReturnValue(true)
    const { container } = renderAt('/mfa-verify', <MfaVerifyPage />)
    expect(screen.getByText('home page')).toBeInTheDocument()
    expect(container.querySelector('[data-e2e="mfa-verify"]')).toBeNull()
  })
})

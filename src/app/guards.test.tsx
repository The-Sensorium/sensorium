import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { RequireAuth, RequireGuest, RequireOnboarded, RequireActiveAccount, RequireCapability, RequireSessionRole, SessionRoleEntry } from './guards'
import { useAuth } from './auth-context'
import { useProfile } from '../lib/use-profile'
import { useSessionRole } from './session-role-context'
import { useMyAccess } from '../features/access'

const authStates = {
  unconfigured: { state: 'unconfigured' as const },
  loading: { state: 'loading' as const },
  signedOut: { state: 'signedOut' as const },
  signedIn: { state: 'signedIn' as const, userId: 'u1', email: 'a@b.test' },
}

const profileStates = {
  loading: { isLoading: true, isError: false, data: null as never, refetch: vi.fn() },
  missing: {
    isLoading: false,
    isError: false,
    data: null as never,
    refetch: vi.fn(),
  },
  notOnboarded: {
    isLoading: false,
    isError: false,
    data: { onboarding_completed_at: null },
    refetch: vi.fn(),
  },
  onboarded: {
    isLoading: false,
    isError: false,
    data: { onboarding_completed_at: '2026-01-01T00:00:00Z' },
    refetch: vi.fn(),
  },
  error: { isLoading: false, isError: true, data: null as never, refetch: vi.fn() },
}

const accessStates = {
  loading: { isLoading: true, isError: false, data: null as never, refetch: vi.fn() },
  error: { isLoading: false, isError: true, data: null as never, refetch: vi.fn() },
  member: {
    isLoading: false,
    isError: false,
    data: {
      user_id: 'u1',
      roles: [],
      available_session_roles: ['member'],
      capabilities: [],
      account_status: 'active',
      restriction_expires_at: null,
      onboarding_completed: true,
      },
    refetch: vi.fn(),
  },
  moderator: {
    isLoading: false,
    isError: false,
    data: {
      user_id: 'u1',
      roles: ['moderator'],
      available_session_roles: ['member', 'moderator'],
      capabilities: ['can_moderate', 'can_apply_temporary_restriction'],
      account_status: 'active',
      restriction_expires_at: null,
      onboarding_completed: true,
      },
    refetch: vi.fn(),
  },
  admin: {
    isLoading: false,
    isError: false,
    data: {
      user_id: 'u1',
      roles: ['admin'],
      available_session_roles: ['member', 'moderator', 'admin'],
      capabilities: [
        'can_moderate',
        'can_apply_temporary_restriction',
        'can_manage_roles',
        'can_apply_permanent_restriction',
        'can_view_audit_log',
      ],
      account_status: 'active',
      restriction_expires_at: null,
      onboarding_completed: true,
      },
    refetch: vi.fn(),
  },
  suspended: {
    isLoading: false,
    isError: false,
    data: {
      user_id: 'u1',
      roles: [],
      available_session_roles: ['member'],
      capabilities: [],
      account_status: 'suspended',
      restriction_expires_at: '2026-09-01T00:00:00Z',
      onboarding_completed: true,
      },
    refetch: vi.fn(),
  },
  banned: {
    isLoading: false,
    isError: false,
    data: {
      user_id: 'u1',
      roles: [],
      available_session_roles: ['member'],
      capabilities: [],
      account_status: 'banned',
      restriction_expires_at: null,
      onboarding_completed: true,
      },
    refetch: vi.fn(),
  },
}

vi.mock('./auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth-context')>()
  return { ...actual, useAuth: vi.fn(() => authStates.signedIn) }
})

vi.mock('../lib/use-profile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/use-profile')>()
  return { ...actual, useProfile: vi.fn(() => profileStates.onboarded) }
})

vi.mock('../features/access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/access')>()
  return { ...actual, useMyAccess: vi.fn(() => accessStates.member) }
})

vi.mock('./session-role-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./session-role-context')>()
  return {
    ...actual,
    useSessionRole: vi.fn(() => ({
      role: null,
      setRole: vi.fn(),
      clearRole: vi.fn(),
    })),
  }
})

function renderGuarded(ui: ReactElement, initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/auth/login" element={<div>login page</div>} />
        <Route path="/auth/signup" element={<div>signup page</div>} />
        <Route path="/home" element={<div>home page</div>} />
        <Route path="/onboarding" element={<div>onboarding page</div>} />
        <Route path="/entry" element={<div>entry page</div>} />
        <Route path="/select-role" element={<div>role picker</div>} />
        <Route path="/restricted" element={<div>restricted page</div>} />
        <Route path="/moderator" element={<div>moderator shell</div>} />
        <Route path="/admin" element={<div>admin shell</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(authStates.signedIn)
  })

  it('renders children for a signed-in user', () => {
    renderGuarded(<RequireAuth>content</RequireAuth>)
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('shows the setup notice when unconfigured', () => {
    vi.mocked(useAuth).mockReturnValue(authStates.unconfigured)
    renderGuarded(<RequireAuth>content</RequireAuth>)
    expect(screen.getByText(/Supabase is not configured yet/i)).toBeInTheDocument()
  })

  it('shows a spinner while loading', () => {
    vi.mocked(useAuth).mockReturnValue(authStates.loading)
    const { container } = renderGuarded(<RequireAuth>content</RequireAuth>)
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('redirects signed-out users to login', () => {
    vi.mocked(useAuth).mockReturnValue(authStates.signedOut)
    renderGuarded(<RequireAuth>content</RequireAuth>)
    expect(screen.getByText('login page')).toBeInTheDocument()
  })
})

describe('RequireGuest', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(authStates.signedOut)
  })

  it('renders children for a signed-out user', () => {
    renderGuarded(<RequireGuest>guest</RequireGuest>)
    expect(screen.getByText('guest')).toBeInTheDocument()
  })

  it('redirects signed-in users to the session-role resolver', () => {
    vi.mocked(useAuth).mockReturnValue(authStates.signedIn)
    renderGuarded(<RequireGuest>guest</RequireGuest>)
    expect(screen.getByText('entry page')).toBeInTheDocument()
  })

  it('shows the setup notice when unconfigured', () => {
    vi.mocked(useAuth).mockReturnValue(authStates.unconfigured)
    renderGuarded(<RequireGuest>guest</RequireGuest>)
    expect(screen.getByText(/Supabase is not configured yet/i)).toBeInTheDocument()
  })
})

describe('RequireOnboarded', () => {
  beforeEach(() => {
    vi.mocked(useProfile).mockReturnValue(profileStates.onboarded)
  })

  it('renders children once onboarding is complete', () => {
    renderGuarded(<RequireOnboarded>home</RequireOnboarded>)
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('shows a spinner while the profile is loading', () => {
    vi.mocked(useProfile).mockReturnValue(profileStates.loading)
    const { container } = renderGuarded(<RequireOnboarded>home</RequireOnboarded>)
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    expect(screen.queryByText('home')).not.toBeInTheDocument()
  })

  it('redirects to onboarding when there is no profile yet', () => {
    vi.mocked(useProfile).mockReturnValue(profileStates.missing)
    renderGuarded(<RequireOnboarded>home</RequireOnboarded>)
    expect(screen.getByText('onboarding page')).toBeInTheDocument()
  })

  it('redirects to onboarding when not completed', () => {
    vi.mocked(useProfile).mockReturnValue(profileStates.notOnboarded)
    renderGuarded(<RequireOnboarded>home</RequireOnboarded>)
    expect(screen.getByText('onboarding page')).toBeInTheDocument()
  })

  it('shows an error state with a retry button', async () => {
    const user = userEvent.setup()
    vi.mocked(useProfile).mockReturnValue(profileStates.error)
    renderGuarded(<RequireOnboarded>home</RequireOnboarded>)
    expect(screen.getByText(/Couldn’t load your profile/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(profileStates.error.refetch).toHaveBeenCalled()
  })
})

describe('RequireActiveAccount', () => {
  beforeEach(() => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.member)
  })

  it('renders children for an active account', () => {
    renderGuarded(<RequireActiveAccount>shell</RequireActiveAccount>)
    expect(screen.getByText('shell')).toBeInTheDocument()
  })

  it('shows a spinner while access is loading', () => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.loading)
    const { container } = renderGuarded(<RequireActiveAccount>shell</RequireActiveAccount>)
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    expect(screen.queryByText('shell')).not.toBeInTheDocument()
  })

  it('redirects a suspended account to /restricted', () => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.suspended)
    renderGuarded(<RequireActiveAccount>shell</RequireActiveAccount>)
    expect(screen.getByText('restricted page')).toBeInTheDocument()
  })

  it('redirects a banned account to /restricted', () => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.banned)
    renderGuarded(<RequireActiveAccount>shell</RequireActiveAccount>)
    expect(screen.getByText('restricted page')).toBeInTheDocument()
  })

  it('shows an error state with a retry button', async () => {
    const user = userEvent.setup()
    vi.mocked(useMyAccess).mockReturnValue(accessStates.error)
    renderGuarded(<RequireActiveAccount>shell</RequireActiveAccount>)
    expect(screen.getByText(/Couldn’t load your account/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(accessStates.error.refetch).toHaveBeenCalled()
  })
})

describe('RequireCapability', () => {
  beforeEach(() => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.admin)
  })

  it('renders children when the capability is present', () => {
    renderGuarded(<RequireCapability capability="can_manage_roles">admin</RequireCapability>)
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('redirects to /select-role when the capability is missing', () => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.moderator)
    renderGuarded(<RequireCapability capability="can_manage_roles">admin</RequireCapability>)
    expect(screen.getByText('role picker')).toBeInTheDocument()
  })

  it('redirects a suspended account to /restricted before checking capability', () => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.suspended)
    renderGuarded(<RequireCapability capability="can_manage_roles">admin</RequireCapability>)
    expect(screen.getByText('restricted page')).toBeInTheDocument()
  })
})

describe('RequireSessionRole', () => {
  beforeEach(() => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.member)
    vi.mocked(useSessionRole).mockReturnValue({ role: 'member', setRole: vi.fn(), clearRole: vi.fn() })
  })

  it('renders children when the current role matches', () => {
    renderGuarded(<RequireSessionRole role="member">home</RequireSessionRole>)
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('redirects to /restricted when the account is not active', () => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.suspended)
    renderGuarded(<RequireSessionRole role="member">home</RequireSessionRole>)
    expect(screen.getByText('restricted page')).toBeInTheDocument()
  })

  it('sends a mismatched role back to /select-role', () => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.moderator)
    renderGuarded(<RequireSessionRole role="admin">admin</RequireSessionRole>)
    expect(screen.getByText('role picker')).toBeInTheDocument()
  })

  it('redirects a lone different available role to /entry', () => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.member)
    vi.mocked(useSessionRole).mockReturnValue({ role: null, setRole: vi.fn(), clearRole: vi.fn() })
    renderGuarded(<RequireSessionRole role="moderator">mod</RequireSessionRole>)
    expect(screen.getByText('entry page')).toBeInTheDocument()
  })

  it('auto-adopts the single available role in an effect', () => {
    const setRole = vi.fn()
    vi.mocked(useSessionRole).mockReturnValue({ role: null, setRole, clearRole: vi.fn() })
    renderGuarded(<RequireSessionRole role="member">home</RequireSessionRole>)
    expect(screen.getByText('home')).toBeInTheDocument()
    expect(setRole).toHaveBeenCalledWith('member')
  })
})

describe('SessionRoleEntry', () => {
  beforeEach(() => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.member)
  })

  it('routes a single-role account straight to its shell', () => {
    renderGuarded(<SessionRoleEntry />)
    expect(screen.getByText('home page')).toBeInTheDocument()
  })

  it('sends a multi-role account to the picker', () => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.admin)
    renderGuarded(<SessionRoleEntry />)
    expect(screen.getByText('role picker')).toBeInTheDocument()
  })

  it('redirects a suspended account to /restricted', () => {
    vi.mocked(useMyAccess).mockReturnValue(accessStates.suspended)
    renderGuarded(<SessionRoleEntry />)
    expect(screen.getByText('restricted page')).toBeInTheDocument()
  })
})

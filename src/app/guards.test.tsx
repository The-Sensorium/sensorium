import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { RequireAuth, RequireGuest, RequireOnboarded } from './guards'
import { useAuth } from './auth-context'
import { useProfile } from '../lib/use-profile'

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

vi.mock('./auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth-context')>()
  return { ...actual, useAuth: vi.fn(() => authStates.signedIn) }
})

vi.mock('../lib/use-profile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/use-profile')>()
  return { ...actual, useProfile: vi.fn(() => profileStates.onboarded) }
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

  it('redirects signed-in users to home', () => {
    vi.mocked(useAuth).mockReturnValue(authStates.signedIn)
    renderGuarded(<RequireGuest>guest</RequireGuest>)
    expect(screen.getByText('home page')).toBeInTheDocument()
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

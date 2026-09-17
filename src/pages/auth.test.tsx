import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { requireSupabase } from '../lib/supabase'
import { LoginPage } from './auth/LoginPage'
import { SignUpPage } from './auth/SignUpPage'
import { ForgotPasswordPage } from './auth/ForgotPasswordPage'
import { VerifyEmailPage } from './auth/VerifyEmailPage'
import { ResetPasswordPage } from './auth/ResetPasswordPage'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button type="button" onClick={() => onSuccess('test-captcha-token')}>
      Solve captcha
    </button>
  ),
}))

const requireSupabaseMock = vi.mocked(requireSupabase)

interface AuthStub {
  signInWithPassword: ReturnType<typeof vi.fn>
  signInWithOAuth: ReturnType<typeof vi.fn>
  signUp: ReturnType<typeof vi.fn>
  resetPasswordForEmail: ReturnType<typeof vi.fn>
  resend: ReturnType<typeof vi.fn>
  updateUser: ReturnType<typeof vi.fn>
}

function stubClient(overrides: Partial<AuthStub> = {}): {
  client: { auth: AuthStub }
  auth: AuthStub
} {
  const auth: AuthStub = {
    signInWithPassword: vi.fn(async () => ({ data: null, error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: null, error: null })),
    signUp: vi.fn(async () => ({ data: null, error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: null, error: null })),
    resend: vi.fn(async () => ({ data: null, error: null })),
    updateUser: vi.fn(async () => ({ data: null, error: null })),
    ...overrides,
  }
  return { client: { auth }, auth }
}

function renderRoute(ui: React.ReactElement) {
  return render(<MemoryRouter initialEntries={['/auth/check']}>{ui}</MemoryRouter>)
}

function renderSignUpFlow() {
  return render(
    <MemoryRouter initialEntries={['/auth/signup']}>
      <Routes>
        <Route path="/auth/signup" element={<SignUpPage />} />
        <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  requireSupabaseMock.mockReset()
  vi.unstubAllEnvs()
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
})

describe('LoginPage', () => {
  it('submits credentials and shows an error from supabase', async () => {
    const { client, auth } = stubClient({
      signInWithPassword: vi.fn(async () => ({
        data: null,
        error: new Error('Invalid login credentials'),
      })),
    })
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderRoute(<LoginPage />)
    await user.type(screen.getByLabelText('Email'), 'a@b.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() =>
      expect(auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.test',
        password: 'password123',
      }),
    )
    expect(screen.getByText('Invalid login credentials')).toBeInTheDocument()
  })

  it('links to signup and forgot password', () => {
    renderRoute(<LoginPage />)
    expect(screen.getByRole('link', { name: /Create an account/ })).toHaveAttribute(
      'href',
      '/auth/signup',
    )
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/auth/forgot-password',
    )
  })

  it('calls signInWithOAuth when the Google button is clicked', async () => {
    const { client, auth } = stubClient()
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderRoute(<LoginPage />)
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))

    await waitFor(() =>
      expect(auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: expect.stringContaining('/entry') },
      }),
    )
  })

  it('disables submit until captcha is solved and forwards the token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
    const { client, auth } = stubClient()
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderRoute(<LoginPage />)
    const loginButton = screen.getByRole('button', { name: 'Login' })
    expect(loginButton).toBeDisabled()

    await user.type(screen.getByLabelText('Email'), 'a@b.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Solve captcha' }))
    await waitFor(() => expect(loginButton).toBeEnabled())
    await user.click(loginButton)

    await waitFor(() =>
      expect(auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.test',
        password: 'password123',
        options: { captchaToken: 'test-captcha-token' },
      }),
    )
  })
})

describe('SignUpPage', () => {
  it('rejects short passwords without calling supabase', async () => {
    renderRoute(<SignUpPage />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'a@b.test')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Confirm Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('rejects mismatched passwords', async () => {
    renderRoute(<SignUpPage />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'a@b.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'different1')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('stores the signup email and redirects to verify-email', async () => {
    const { client, auth } = stubClient()
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderSignUpFlow()
    await user.type(screen.getByLabelText('Email'), 'new@b.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    await waitFor(() =>
      expect(auth.signUp).toHaveBeenCalledWith({
        email: 'new@b.test',
        password: 'password123',
        options: { emailRedirectTo: expect.stringContaining('/auth/verify-email') },
      }),
    )
    await waitFor(() =>
      expect(screen.getByText('Verify your email address')).toBeInTheDocument(),
    )
  })

  it('calls signInWithOAuth when the Google button is clicked', async () => {
    const { client, auth } = stubClient()
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderRoute(<SignUpPage />)
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))

    await waitFor(() =>
      expect(auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: expect.stringContaining('/entry') },
      }),
    )
  })

  it('forwards the captcha token when a site key is configured', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
    const { client, auth } = stubClient()
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderSignUpFlow()
    const createButton = screen.getByRole('button', { name: 'Create Account' })
    expect(createButton).toBeDisabled()

    await user.type(screen.getByLabelText('Email'), 'new@b.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Solve captcha' }))
    await waitFor(() => expect(createButton).toBeEnabled())
    await user.click(createButton)

    await waitFor(() =>
      expect(auth.signUp).toHaveBeenCalledWith({
        email: 'new@b.test',
        password: 'password123',
        options: {
          emailRedirectTo: expect.stringContaining('/auth/verify-email'),
          captchaToken: 'test-captcha-token',
        },
      }),
    )
  })
})

describe('ForgotPasswordPage', () => {
  it('sends the reset link and shows the inbox message', async () => {
    const { client, auth } = stubClient()
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderRoute(<ForgotPasswordPage />)
    await user.type(screen.getByLabelText('Email'), 'a@b.test')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.test', {
        redirectTo: expect.stringContaining('/auth/reset-password'),
      }),
    )
    expect(screen.getByText('Check your inbox')).toBeInTheDocument()
  })

  it('forwards the captcha token when a site key is configured', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
    const { client, auth } = stubClient()
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderRoute(<ForgotPasswordPage />)
    const sendButton = screen.getByRole('button', { name: 'Send reset link' })
    expect(sendButton).toBeDisabled()

    await user.type(screen.getByLabelText('Email'), 'a@b.test')
    await user.click(screen.getByRole('button', { name: 'Solve captcha' }))
    await waitFor(() => expect(sendButton).toBeEnabled())
    await user.click(sendButton)

    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.test', {
        redirectTo: expect.stringContaining('/auth/reset-password'),
        captchaToken: 'test-captcha-token',
      }),
    )
  })
})

describe('VerifyEmailPage', () => {
  it('resends the confirmation email when a stored email exists', async () => {
    sessionStorage.setItem('sensorium:signup-email', 'new@b.test')
    const { client, auth } = stubClient()
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderRoute(<VerifyEmailPage />)
    await user.click(screen.getByRole('button', { name: 'Resend email' }))

    await waitFor(() =>
      expect(auth.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'new@b.test',
        options: { emailRedirectTo: expect.stringContaining('/auth/verify-email') },
      }),
    )
    expect(screen.getByText('We re-sent the confirmation email to your inbox.')).toBeInTheDocument()
  })

  it('reports a missing stored email', async () => {
    sessionStorage.removeItem('sensorium:signup-email')
    renderRoute(<VerifyEmailPage />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Resend email' }))

    expect(screen.getByText('We could not find your email. Please sign up again.')).toBeInTheDocument()
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('disables resend until captcha is solved and forwards the token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
    sessionStorage.setItem('sensorium:signup-email', 'new@b.test')
    const { client, auth } = stubClient()
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderRoute(<VerifyEmailPage />)
    const resendButton = screen.getByRole('button', { name: 'Resend email' })
    expect(resendButton).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Solve captcha' }))
    await waitFor(() => expect(resendButton).toBeEnabled())
    await user.click(resendButton)

    await waitFor(() =>
      expect(auth.resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'new@b.test',
        options: {
          emailRedirectTo: expect.stringContaining('/auth/verify-email'),
          captchaToken: 'test-captcha-token',
        },
      }),
    )
  })

  it('surfaces resend failures instead of reporting success', async () => {
    sessionStorage.setItem('sensorium:signup-email', 'new@b.test')
    const { client, auth } = stubClient({
      resend: vi.fn(async () => ({ data: null, error: new Error('captcha failed') })),
    })
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderRoute(<VerifyEmailPage />)
    await user.click(screen.getByRole('button', { name: 'Resend email' }))

    await waitFor(() => expect(auth.resend).toHaveBeenCalled())
    expect(screen.getByText('Could not resend the email. Please try again.')).toBeInTheDocument()
  })
})

describe('ResetPasswordPage', () => {
  it('rejects a short new password', async () => {
    renderRoute(<ResetPasswordPage />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('New Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('updates the password on submit', async () => {
    const { client, auth } = stubClient()
    requireSupabaseMock.mockReturnValue(client as never)
    const user = userEvent.setup()

    renderRoute(<ResetPasswordPage />)
    await user.type(screen.getByLabelText('New Password'), 'newpassword123')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword123' }))
  })
})

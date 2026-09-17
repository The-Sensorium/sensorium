import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { MobileChallengePage } from './MobileChallengePage'

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({
    onSuccess,
    onError,
    options,
  }: {
    onSuccess: (token: string) => void
    onError: () => void
    options?: { theme?: string }
  }) => (
    <div>
      <button
        type="button"
        data-theme={options?.theme ?? 'auto'}
        onClick={() => onSuccess('mobile-token-123')}
      >
        Solve captcha
      </button>
      <button type="button" onClick={onError}>
        Fail captcha
      </button>
    </div>
  ),
}))

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
  Reflect.deleteProperty(window, 'ReactNativeWebView')
  document.documentElement.classList.remove('dark')
})

describe('MobileChallengePage', () => {
  it('shows unavailable when no site key is configured', () => {
    render(
      <MemoryRouter>
        <MobileChallengePage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Human verification is unavailable.')).toBeInTheDocument()
  })

  it('posts the token to the React Native WebView on success', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
    const postMessage = vi.fn()
    Reflect.set(window, 'ReactNativeWebView', { postMessage })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <MobileChallengePage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/verifying you're human/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Solve captcha' }))
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'turnstile-token', token: 'mobile-token-123' }),
    )
    expect(screen.getByText(/verified. returning to the app/i)).toBeInTheDocument()
  })

  it('shows a retry affordance on failure and recovers on retry', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
    const postMessage = vi.fn()
    Reflect.set(window, 'ReactNativeWebView', { postMessage })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <MobileChallengePage />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Fail captcha' }))
    expect(screen.getByText('Human verification failed to load.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry verification' }))
    await user.click(screen.getByRole('button', { name: 'Solve captcha' }))
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'turnstile-token', token: 'mobile-token-123' }),
    )
  })

  it('applies the requested theme to the page and the widget', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
    window.history.replaceState({}, '', '/auth/mobile-challenge?theme=dark')
    try {
      render(
        <MemoryRouter initialEntries={['/auth/mobile-challenge?theme=dark']}>
          <MobileChallengePage />
        </MemoryRouter>,
      )
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(screen.getByRole('button', { name: 'Solve captcha' })).toHaveAttribute(
        'data-theme',
        'dark',
      )
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })

  it('leaves theming automatic when no theme is requested', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
    window.history.replaceState({}, '', '/auth/mobile-challenge')
    try {
      render(
        <MemoryRouter initialEntries={['/auth/mobile-challenge']}>
          <MobileChallengePage />
        </MemoryRouter>,
      )
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(screen.getByRole('button', { name: 'Solve captcha' })).toHaveAttribute(
        'data-theme',
        'auto',
      )
    } finally {
      window.history.replaceState({}, '', '/')
    }
  })
})

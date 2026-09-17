import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaptchaSection, TurnstileWidget } from './TurnstileWidget'

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({
    onSuccess,
    onExpire,
    onError,
  }: {
    onSuccess: (token: string) => void
    onExpire: () => void
    onError: () => void
  }) => (
    <div>
      <button type="button" onClick={() => onSuccess('test-token')}>
        Solve captcha
      </button>
      <button type="button" onClick={onExpire}>
        Expire captcha
      </button>
      <button type="button" onClick={onError}>
        Fail captcha
      </button>
    </div>
  ),
}))

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('TurnstileWidget', () => {
  it('renders nothing when no site key is configured', () => {
    const { container } = render(<TurnstileWidget siteKey="" onToken={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('forwards the token on success and clears it on expiry', async () => {
    const onToken = vi.fn()
    const user = userEvent.setup()
    render(<TurnstileWidget siteKey="site-key-123" onToken={onToken} />)

    await user.click(screen.getByRole('button', { name: 'Solve captcha' }))
    expect(onToken).toHaveBeenCalledWith('test-token')

    await user.click(screen.getByRole('button', { name: 'Expire captcha' }))
    expect(onToken).toHaveBeenCalledWith(null)
  })

  it('clears the token and reports load failures', async () => {
    const onToken = vi.fn()
    const onError = vi.fn()
    const user = userEvent.setup()
    render(<TurnstileWidget siteKey="site-key-123" onToken={onToken} onError={onError} />)

    await user.click(screen.getByRole('button', { name: 'Fail captcha' }))
    expect(onToken).toHaveBeenCalledWith(null)
    expect(onError).toHaveBeenCalledOnce()
  })

  it('removes a dead provider script on unmount so a remount retries the load', () => {
    Reflect.deleteProperty(window, 'turnstile')
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    document.head.appendChild(script)

    const { unmount } = render(<TurnstileWidget siteKey="site-key-123" onToken={vi.fn()} />)
    unmount()
    expect(document.querySelector('script[src*="challenges.cloudflare"]')).toBeNull()
  })

  it('keeps a working provider script on unmount', () => {
    Reflect.set(window, 'turnstile', {})
    try {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      document.head.appendChild(script)

      const { unmount } = render(<TurnstileWidget siteKey="site-key-123" onToken={vi.fn()} />)
      unmount()
      expect(document.querySelector('script[src*="challenges.cloudflare"]')).not.toBeNull()
      script.remove()
    } finally {
      Reflect.deleteProperty(window, 'turnstile')
    }
  })
})

describe('CaptchaSection', () => {
  const baseProps = {
    siteKey: 'site-key-123',
    widgetKey: 0,
    onToken: vi.fn(),
    onFailed: vi.fn(),
    onRetry: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when no site key is configured', () => {
    const { container } = render(
      <CaptchaSection {...baseProps} siteKey="" tokenReady={false} failed={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a verifying hint while waiting for the token', () => {
    render(<CaptchaSection {...baseProps} tokenReady={false} failed={false} />)
    expect(screen.getByText(/verifying you're human/i)).toBeInTheDocument()
  })

  it('hides the hint once the token is ready', () => {
    render(<CaptchaSection {...baseProps} tokenReady failed={false} />)
    expect(screen.queryByText(/verifying you're human/i)).not.toBeInTheDocument()
  })

  it('shows a retry affordance on failure and retries on click', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(
      <CaptchaSection {...baseProps} tokenReady={false} failed onRetry={onRetry} />,
    )
    await user.click(screen.getByRole('button', { name: 'Retry verification' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('reports widget failures through onFailed', async () => {
    const onFailed = vi.fn()
    const user = userEvent.setup()
    render(
      <CaptchaSection {...baseProps} tokenReady={false} failed={false} onFailed={onFailed} />,
    )
    await user.click(screen.getByRole('button', { name: 'Fail captcha' }))
    expect(onFailed).toHaveBeenCalledOnce()
  })

  it('reports failure when the provider script never loads', () => {
    vi.useFakeTimers()
    try {
      Reflect.deleteProperty(window, 'turnstile')
      const onFailed = vi.fn()
      render(
        <CaptchaSection {...baseProps} tokenReady={false} failed={false} onFailed={onFailed} />,
      )
      vi.advanceTimersByTime(8000)
      expect(onFailed).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stays quiet when the provider script loaded but the token is pending', () => {
    vi.useFakeTimers()
    try {
      Reflect.set(window, 'turnstile', {})
      const onFailed = vi.fn()
      render(
        <CaptchaSection {...baseProps} tokenReady={false} failed={false} onFailed={onFailed} />,
      )
      vi.advanceTimersByTime(30000)
      expect(onFailed).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(window, 'turnstile')
      vi.useRealTimers()
    }
  })

  it('stays quiet when the token arrives before the timeout', () => {
    vi.useFakeTimers()
    try {
      Reflect.deleteProperty(window, 'turnstile')
      const onFailed = vi.fn()
      const { rerender } = render(
        <CaptchaSection {...baseProps} tokenReady={false} failed={false} onFailed={onFailed} />,
      )
      rerender(
        <CaptchaSection {...baseProps} tokenReady failed={false} onFailed={onFailed} />,
      )
      vi.advanceTimersByTime(30000)
      expect(onFailed).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

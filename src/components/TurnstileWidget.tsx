import { useEffect, useRef } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'

export function TurnstileWidget({
  siteKey,
  onToken,
  onError,
  theme,
}: {
  siteKey: string
  onToken: (token: string | null) => void
  onError?: () => void
  theme?: 'auto' | 'light' | 'dark'
}) {
  useEffect(() => {
    if (!siteKey) return
    return () => {
      if (!('turnstile' in window)) {
        document
          .querySelectorAll('script[src*="challenges.cloudflare.com/turnstile"]')
          .forEach((script) => script.remove())
      }
    }
  }, [siteKey])
  if (!siteKey) return null
  return (
    <Turnstile
      siteKey={siteKey}
      options={{ theme: theme ?? 'auto' }}
      onSuccess={(token) => onToken(token)}
      onExpire={() => onToken(null)}
      onError={() => {
        onToken(null)
        onError?.()
      }}
    />
  )
}

export function CaptchaSection({
  siteKey,
  widgetKey,
  tokenReady,
  failed,
  onToken,
  onFailed,
  onRetry,
  theme,
}: {
  siteKey: string
  widgetKey: number
  tokenReady: boolean
  failed: boolean
  onToken: (token: string | null) => void
  onFailed: () => void
  onRetry: () => void
  theme?: 'auto' | 'light' | 'dark'
}) {
  const stateRef = useRef({ tokenReady, onFailed })
  stateRef.current = { tokenReady, onFailed }
  useEffect(() => {
    if (!siteKey) return
    const timer = setTimeout(() => {
      const state = stateRef.current
      if (!state.tokenReady && !('turnstile' in window)) state.onFailed()
    }, 8000)
    return () => clearTimeout(timer)
  }, [siteKey, widgetKey])
  if (!siteKey) return null
  return (
    <div>
      <TurnstileWidget
        key={widgetKey}
        siteKey={siteKey}
        theme={theme}
        onToken={onToken}
        onError={onFailed}
      />
      {failed && !tokenReady ? (
        <div className="mt-1">
          <p className="text-xs text-error">Human verification failed to load.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-xs font-semibold text-primary hover:underline"
          >
            Retry verification
          </button>
        </div>
      ) : !tokenReady ? (
        <p className="mt-1 text-xs text-on-surface-variant">Verifying you&apos;re human…</p>
      ) : null}
    </div>
  )
}

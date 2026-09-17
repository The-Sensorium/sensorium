import { useEffect, useState } from 'react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { applyTheme } from '../../lib/theme'
import { CaptchaSection } from '../../components/TurnstileWidget'
import { turnstileSiteKey } from '../../lib/turnstile'

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
}

function postToken(token: string) {
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'turnstile-token', token }))
}

function challengeTheme(): 'light' | 'dark' | undefined {
  const theme = new URLSearchParams(window.location.search).get('theme')
  return theme === 'dark' || theme === 'light' ? theme : undefined
}

export function MobileChallengePage() {
  useDocumentTitle('Verify')
  const siteKey = turnstileSiteKey()
  const [token, setToken] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [widgetKey, setWidgetKey] = useState(0)
  const theme = challengeTheme()

  useEffect(() => {
    if (!theme) return
    applyTheme(theme)
    const timer = setTimeout(() => applyTheme(theme), 0)
    return () => clearTimeout(timer)
  }, [theme])

  if (!siteKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-6">
        <p className="text-sm text-on-surface-variant">Human verification is unavailable.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6">
      <div className="w-full max-w-xs text-center">
        {token ? (
          <p className="mb-4 text-sm text-on-surface-variant">Verified. Returning to the app…</p>
        ) : null}
        <div className="flex justify-center">
          <CaptchaSection
            siteKey={siteKey}
            widgetKey={widgetKey}
            tokenReady={token !== null}
            failed={failed}
            theme={theme}
            onToken={(next) => {
              setToken(next)
              if (next) postToken(next)
            }}
            onFailed={() => setFailed(true)}
            onRetry={() => {
              setFailed(false)
              setWidgetKey((k) => k + 1)
            }}
          />
        </div>
      </div>
    </div>
  )
}

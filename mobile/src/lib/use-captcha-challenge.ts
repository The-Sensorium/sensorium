import { useState } from 'react'
import { captchaChallengeUrl } from './captcha'
import { useResolvedScheme } from './theme-choice'

export function useCaptchaChallenge() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetKey, setSheetKey] = useState(0)
  const scheme = useResolvedScheme()
  const base = captchaChallengeUrl()
  const challengeUrl = base ? `${base}?theme=${scheme}` : null

  function openChallenge() {
    setSheetKey((k) => k + 1)
    setSheetOpen(true)
  }

  function closeChallenge() {
    setSheetOpen(false)
  }

  return { challengeUrl, sheetOpen, sheetKey, openChallenge, closeChallenge }
}

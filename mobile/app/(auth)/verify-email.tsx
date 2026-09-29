import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { requireSupabase } from '../../src/lib/supabase'
import { getSignupEmail } from '../../src/lib/auth-storage'
import { useCaptchaChallenge } from '../../src/lib/use-captcha-challenge'
import { captchaBypassAllowed } from '../../src/lib/captcha'
import { CaptchaSheet } from '../../src/components/captcha-sheet'
import { authRedirect } from '../../src/lib/deep-links'
import { AuthLink, AuthShell, MutedCenter, PrimaryButton } from '../../src/components/ui'
import { useTheme } from '../../src/lib/use-theme'
import { Text } from 'react-native'

export default function VerifyEmailScreen() {
  const t = useTheme()
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const captcha = useCaptchaChallenge()

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function doResend(captchaToken: string | null) {
    const email = await getSignupEmail()
    if (!email) {
      setMessage('We could not find your email. Please sign up again.')
      return
    }
    setMessage(null)
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: authRedirect('verify-email'),
          ...(captchaToken ? { captchaToken } : {}),
        },
      })
      if (error) throw error
      setMessage('We re-sent the confirmation email to your inbox.')
      setCooldown(30)
    } catch {
      setMessage('Could not resend the email. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function resend() {
    if (submitting || cooldown > 0) return
    if (!captcha.challengeUrl) {
      if (!captchaBypassAllowed()) {
        setMessage('Human verification is unavailable. Please update the app and try again.')
        return
      }
      void doResend(null)
      return
    }
    captcha.openChallenge()
  }

  function handleSheetToken(token: string) {
    captcha.closeChallenge()
    void doResend(token)
  }

  return (
    <AuthShell
      title="Verify your email address"
      subtitle="We sent a confirmation link to your inbox. Tap it to activate your account, then sign in."
    >
      <PrimaryButton
        title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
        loadingTitle="Sending…"
        onPress={resend}
        loading={submitting}
        disabled={cooldown > 0}
      />
      {captcha.challengeUrl && captcha.sheetOpen ? (
        <CaptchaSheet
          key={captcha.sheetKey}
          challengeUrl={captcha.challengeUrl}
          onToken={handleSheetToken}
          onClose={captcha.closeChallenge}
        />
      ) : null}
      {message ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ marginTop: 16, fontSize: 14, color: t.onSurfaceVariant, textAlign: 'center' }}
        >
          {message}
        </Text>
      ) : null}
      <View style={{ marginTop: 24 }}>
        <MutedCenter>
          <AuthLink href="/(auth)/login">Sign in</AuthLink>
        </MutedCenter>
      </View>
    </AuthShell>
  )
}

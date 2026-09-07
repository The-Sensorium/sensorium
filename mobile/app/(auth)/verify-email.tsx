import { useState } from 'react'
import { View } from 'react-native'
import { requireSupabase } from '../../src/lib/supabase'
import { getSignupEmail } from '../../src/lib/auth-storage'
import { authRedirect } from '../../src/lib/deep-links'
import { AuthLink, AuthShell, MutedCenter, PrimaryButton } from '../../src/components/ui'
import { useTheme } from '../../src/lib/use-theme'
import { Text } from 'react-native'

export default function VerifyEmailScreen() {
  const t = useTheme()
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function resend() {
    const email = await getSignupEmail()
    if (!email) {
      setMessage('We could not find your email. Please sign up again.')
      return
    }
    setMessage(null)
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: authRedirect('verify-email') },
      })
      setMessage('We re-sent the confirmation email to your inbox.')
    } catch {
      setMessage('Could not resend the email. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Verify your email address"
      subtitle="We sent a confirmation link to your inbox. Tap it to activate your account, then sign in."
    >
      <PrimaryButton title="Resend email" loadingTitle="Sending…" onPress={resend} loading={submitting} />
      {message ? (
        <Text style={{ marginTop: 16, fontSize: 14, color: t.onSurfaceVariant, textAlign: 'center' }}>
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

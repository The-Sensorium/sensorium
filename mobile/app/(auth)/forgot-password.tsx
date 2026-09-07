import { useState } from 'react'
import { View } from 'react-native'
import { requireSupabase } from '../../src/lib/supabase'
import { toErrorMessage } from '../../src/lib/error'
import { authRedirect } from '../../src/lib/deep-links'
import { AuthLink, AuthShell, ErrorText, Field, MutedCenter, PrimaryButton } from '../../src/components/ui'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: authRedirect('reset-password'),
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="If an account exists for that email, a reset link is on its way."
      />
    )
  }

  return (
    <AuthShell title="Reset password" subtitle="Enter your email and we'll send you a reset link.">
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
        onSubmitEditing={onSubmit}
      />
      <ErrorText message={error} />
      <PrimaryButton title="Send reset link" loadingTitle="Sending…" onPress={onSubmit} loading={submitting} />
      <View style={{ marginTop: 24 }}>
        <MutedCenter>
          <AuthLink href="/(auth)/login">Back to sign in</AuthLink>
        </MutedCenter>
      </View>
    </AuthShell>
  )
}

import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { requireSupabase } from '../../src/lib/supabase'
import { toErrorMessage } from '../../src/lib/error'
import { setSignupEmail } from '../../src/lib/auth-storage'
import { authRedirect } from '../../src/lib/deep-links'
import { AuthLink, AuthShell, ErrorText, Field, MutedCenter, PrimaryButton } from '../../src/components/ui'

export default function SignupScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit() {
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: authRedirect('verify-email') },
      })
      if (error) throw error
      await setSignupEmail(email.trim())
      router.replace('/(auth)/verify-email')
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Verify your email and complete your profile to get started."
    >
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />
      <Field
        label="Confirm Password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        onSubmitEditing={onSubmit}
      />
      <ErrorText message={error} />
      <PrimaryButton title="Create Account" loadingTitle="Creating…" onPress={onSubmit} loading={submitting} />
      <View style={{ marginTop: 24 }}>
        <MutedCenter>
          Already have an account? <AuthLink href="/(auth)/login">Sign in</AuthLink>
        </MutedCenter>
      </View>
    </AuthShell>
  )
}

import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { requireSupabase } from '../../src/lib/supabase'
import { toErrorMessage } from '../../src/lib/error'
import { signInWithGoogle } from '../../src/lib/google-auth'
import { AuthLink, AuthShell, ErrorText, Field, GoogleButton, MutedCenter, OrDivider, PrimaryButton } from '../../src/components/ui'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)

  async function onSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw error
      router.replace('/(app)/home')
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function onGoogle() {
    setError(null)
    setGoogleBusy(true)
    try {
      const outcome = await signInWithGoogle()
      if (outcome === 'success') router.replace('/(app)/home')
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
    } finally {
      setGoogleBusy(false)
    }
  }

  const busy = submitting || googleBusy

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your clusters.">
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
        autoComplete="password"
        onSubmitEditing={onSubmit}
      />
      <View style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <AuthLink href="/(auth)/forgot-password">Forgot password?</AuthLink>
      </View>
      <ErrorText message={error} />
      <PrimaryButton title="Login" onPress={onSubmit} loading={submitting} disabled={busy} />
      <OrDivider />
      <GoogleButton onPress={onGoogle} loading={googleBusy} disabled={busy} />
      <View style={{ marginTop: 24 }}>
        <MutedCenter>
          New here? <AuthLink href="/(auth)/signup">Create an account</AuthLink>
        </MutedCenter>
      </View>
    </AuthShell>
  )
}

import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { requireSupabase } from '../../src/lib/supabase'
import { toErrorMessage } from '../../src/lib/error'
import { AuthLink, AuthShell, ErrorText, Field, MutedCenter, PrimaryButton } from '../../src/components/ui'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
      <PrimaryButton title="Login" onPress={onSubmit} loading={submitting} />
      <View style={{ marginTop: 24 }}>
        <MutedCenter>
          New here? <AuthLink href="/(auth)/signup">Create an account</AuthLink>
        </MutedCenter>
      </View>
    </AuthShell>
  )
}

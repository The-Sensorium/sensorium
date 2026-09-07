import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { requireSupabase } from '../../src/lib/supabase'
import { toErrorMessage } from '../../src/lib/error'
import { AuthLink, AuthShell, ErrorText, Field, MutedCenter, PrimaryButton } from '../../src/components/ui'

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit() {
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      router.replace('/(auth)/login')
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title="Choose a new password">
      <Field
        label="New Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        onSubmitEditing={onSubmit}
      />
      <ErrorText message={error} />
      <PrimaryButton title="Update password" loadingTitle="Updating…" onPress={onSubmit} loading={submitting} />
      <View style={{ marginTop: 24 }}>
        <MutedCenter>
          <AuthLink href="/(auth)/login">Back to sign in</AuthLink>
        </MutedCenter>
      </View>
    </AuthShell>
  )
}

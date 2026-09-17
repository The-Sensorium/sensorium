import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { requireSupabase } from '../../src/lib/supabase'
import { toErrorMessage } from '../../src/lib/error'
import { useCaptchaChallenge } from '../../src/lib/use-captcha-challenge'
import { captchaBypassAllowed } from '../../src/lib/captcha'
import { CaptchaSheet } from '../../src/components/captcha-sheet'
import { signInWithGoogle } from '../../src/lib/google-auth'
import { AuthLink, AuthShell, ErrorText, Field, GoogleButton, MutedCenter, OrDivider, PasswordField, PrimaryButton } from '../../src/components/ui'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const captcha = useCaptchaChallenge()

  async function doSubmit(captchaToken: string | null) {
    setError(null)
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const { error } = await supabase.auth.signInWithPassword(
        captchaToken
          ? { email: email.trim(), password, options: { captchaToken } }
          : { email: email.trim(), password },
      )
      if (error) throw error
      router.replace('/(app)/home')
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
    } finally {
      setSubmitting(false)
    }
  }

  function onSubmit() {
    if (submitting) return
    setError(null)
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (!captcha.challengeUrl) {
      if (!captchaBypassAllowed()) {
        setError('Human verification is unavailable. Please update the app and try again.')
        return
      }
      void doSubmit(null)
      return
    }
    captcha.openChallenge()
  }

  function handleSheetToken(token: string) {
    captcha.closeChallenge()
    void doSubmit(token)
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
      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="password"
        onSubmitEditing={onSubmit}
      />
      <View style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <AuthLink href="/(auth)/forgot-password">Forgot password?</AuthLink>
      </View>
      <ErrorText message={error} />
      <PrimaryButton title="Login" onPress={onSubmit} loading={submitting} disabled={busy} />
      {captcha.challengeUrl && captcha.sheetOpen ? (
        <CaptchaSheet
          key={captcha.sheetKey}
          challengeUrl={captcha.challengeUrl}
          onToken={handleSheetToken}
          onClose={captcha.closeChallenge}
        />
      ) : null}
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

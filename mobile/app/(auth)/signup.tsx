import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { goHome } from '../../src/lib/auth-navigation'
import { requireSupabase } from '../../src/lib/supabase'
import { toErrorMessage } from '../../src/lib/error'
import { useCaptchaChallenge } from '../../src/lib/use-captcha-challenge'
import { captchaBypassAllowed } from '../../src/lib/captcha'
import { CaptchaSheet } from '../../src/components/captcha-sheet'
import { setSignupEmail } from '../../src/lib/auth-storage'
import { authRedirect } from '../../src/lib/deep-links'
import { signInWithGoogle } from '../../src/lib/google-auth'
import { AuthLink, AuthShell, ErrorText, Field, GoogleButton, MutedCenter, OrDivider, PasswordField, PrimaryButton } from '../../src/components/ui'

export default function SignupScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const captcha = useCaptchaChallenge()

  async function doSubmit(captchaToken: string | null) {
    setError(null)
    setSubmitting(true)
    try {
      const supabase = requireSupabase()
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authRedirect('verify-email'),
          ...(captchaToken ? { captchaToken } : {}),
        },
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

  function onSubmit() {
    if (submitting) return
    setError(null)
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
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
      if (outcome === 'success') goHome()
    } catch (err) {
      setError(toErrorMessage(err, 'Something went wrong.'))
    } finally {
      setGoogleBusy(false)
    }
  }

  const busy = submitting || googleBusy

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
      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
      />
      <PasswordField
        label="Confirm Password"
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
        onSubmitEditing={onSubmit}
      />
      <ErrorText message={error} />
      <PrimaryButton title="Create Account" loadingTitle="Creating…" onPress={onSubmit} loading={submitting} disabled={busy} />
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
          Already have an account? <AuthLink href="/(auth)/login">Sign in</AuthLink>
        </MutedCenter>
      </View>
    </AuthShell>
  )
}

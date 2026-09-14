import { useState } from 'react'
import { Redirect } from 'expo-router'
import { useAuth } from '../src/auth-context'
import { AnimatedSplash } from '../src/components/AnimatedSplash'

export default function Index() {
  const auth = useAuth()
  const [splashDone, setSplashDone] = useState(false)

  // Custom animated splash takes over seamlessly from the static native
  // splash (same bg). It runs a minimum duration while auth resolves.
  if (!splashDone || auth.state === 'loading' || auth.state === 'unconfigured') {
    return <AnimatedSplash onFinish={() => setSplashDone(true)} />
  }

  return <Redirect href={auth.state === 'signedIn' ? '/(app)/home' : '/(auth)/login'} />
}

import { useEffect, useState } from 'react'
import { Redirect } from 'expo-router'
import * as Linking from 'expo-linking'
import { handleAuthCallback } from '../../src/lib/deep-links'
import { resetTo } from '../../src/lib/auth-navigation'

export default function AuthCallback() {
  const [done, setDone] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const initial = await Linking.getInitialURL()
        if (initial && /\/auth\/callback/i.test(initial)) {
          const result = await handleAuthCallback(initial)
          if (!live) return
          if (result === 'recovery') resetTo('/(auth)/reset-password')
          else if (result === 'session') resetTo('/(app)/home')
        }
      } catch (err) {
        console.warn('Auth callback failed', err)
      } finally {
        if (live) setDone(true)
      }
    })()
    return () => {
      live = false
    }
  }, [])

  if (!done) return null
  return <Redirect href="/" />
}

import * as WebBrowser from 'expo-web-browser'
import { authRedirect, handleAuthCallback } from './deep-links'
import { requireSupabase } from './supabase'

WebBrowser.maybeCompleteAuthSession()

export function googleAuthRedirect(): string {
  return authRedirect('auth/callback')
}

export async function signInWithGoogle(): Promise<'success' | 'cancelled'> {
  const supabase = requireSupabase()
  const redirectTo = googleAuthRedirect()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  })
  if (error) throw error
  if (!data?.url) throw new Error('Google sign-in failed to start.')
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (res.type !== 'success') return 'cancelled'
  const result = await handleAuthCallback(res.url)
  if (!result) throw new Error('Google sign-in did not complete.')
  return 'success'
}

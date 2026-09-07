import * as Linking from 'expo-linking'
import { requireSupabase } from './supabase'

export type AuthCallback = 'session' | 'recovery'

export function authRedirect(path: string): string {
  return Linking.createURL(path)
}

function first(value: unknown): string | null {
  if (typeof value === 'string' && value) return value
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0]) return value[0]
  return null
}

export async function handleAuthCallback(url: string): Promise<AuthCallback | null> {
  const supabase = requireSupabase()
  const { queryParams } = Linking.parse(url)
  const params = queryParams ?? {}

  const code = first(params.code)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
    return first(params.type) === 'recovery' ? 'recovery' : 'session'
  }

  const tokenHash = first(params.token_hash)
  const type = first(params.type)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup',
    })
    if (error) throw error
    return type === 'recovery' ? 'recovery' : 'session'
  }

  const hash = url.split('#')[1]
  if (hash) {
    const pairs = Object.fromEntries(new URLSearchParams(hash))
    if (pairs.access_token && pairs.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: pairs.access_token,
        refresh_token: pairs.refresh_token,
      })
      if (error) throw error
      return pairs.type === 'recovery' ? 'recovery' : 'session'
    }
  }

  return null
}

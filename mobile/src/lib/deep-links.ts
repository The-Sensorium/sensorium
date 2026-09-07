import * as Linking from 'expo-linking'
import { requireSupabase } from './supabase'

export type AuthCallback = 'session' | 'recovery'

export function authRedirect(path: string): string {
  return Linking.createURL(path)
}

const consumedCodes = new Set<string>()

function first(value: unknown): string | null {
  if (typeof value === 'string' && value) return value
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0]) return value[0]
  return null
}

export async function handleAuthCallback(url: string): Promise<AuthCallback | null> {
  const { queryParams } = Linking.parse(url)
  const params = queryParams ?? {}

  const oauthError = first(params.error)
  if (oauthError) {
    throw new Error(first(params.error_description) ?? 'Google sign-in did not complete.')
  }

  const code = first(params.code)
  const tokenHash = first(params.token_hash)
  const type = first(params.type)
  const hash = url.split('#')[1]
  const pairs = hash ? Object.fromEntries(new URLSearchParams(hash)) : null
  const hasHashSession = Boolean(pairs?.access_token && pairs?.refresh_token)

  if (!code && !(tokenHash && type) && !hasHashSession) return null

  const supabase = requireSupabase()
  if (code) {
    if (consumedCodes.has(code)) return first(params.type) === 'recovery' ? 'recovery' : 'session'
    consumedCodes.add(code)
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) throw error
    } catch (err) {
      consumedCodes.delete(code)
      throw err
    }
    return first(params.type) === 'recovery' ? 'recovery' : 'session'
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup',
    })
    if (error) throw error
    return type === 'recovery' ? 'recovery' : 'session'
  }

  if (hash && pairs?.access_token && pairs?.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: pairs.access_token,
      refresh_token: pairs.refresh_token,
    })
    if (error) throw error
    return pairs.type === 'recovery' ? 'recovery' : 'session'
  }

  return null
}

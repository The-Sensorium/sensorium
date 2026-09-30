import * as Linking from 'expo-linking'
import { requireSupabase } from './supabase'

export type AuthCallback = 'session' | 'recovery'

export function authRedirect(path: string): string {
  return Linking.createURL(path)
}

const consumedCodes = new Set<string>()
const MAX_CONSUMED_CODES = 50

const ALLOWED_OTP_TYPES = new Set(['signup', 'recovery', 'email_change', 'invite', 'magiclink'])

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
    if (consumedCodes.size > MAX_CONSUMED_CODES) {
      const oldest = consumedCodes.values().next().value
      if (oldest) consumedCodes.delete(oldest)
    }
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
    if (!ALLOWED_OTP_TYPES.has(type)) {
      throw new Error('Unsupported link type.')
    }
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'recovery' | 'email_change' | 'invite' | 'magiclink',
    })
    if (error) throw error
    return type === 'recovery' ? 'recovery' : 'session'
  }

  if (hasHashSession) {
    console.warn('Deprecated implicit hash session link ignored. Use PKCE code links.')
    return null
  }

  return null
}

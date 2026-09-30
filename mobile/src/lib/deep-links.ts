import * as Linking from 'expo-linking'
import { requireSupabase } from './supabase'

export type AuthCallback = 'session' | 'recovery'

export function authRedirect(path: string): string {
  return Linking.createURL(path)
}

const inflightCodes = new Map<string, Promise<AuthCallback>>()
const completedCodes = new Map<string, { result: AuthCallback; expires: number }>()
const MAX_COMPLETED_CODES = 50
const COMPLETED_TTL_MS = 10 * 60 * 1000

function pruneCompletedCodes(): void {
  const now = Date.now()
  for (const [key, value] of completedCodes) {
    if (value.expires <= now) completedCodes.delete(key)
  }
  while (completedCodes.size > MAX_COMPLETED_CODES) {
    const oldest = completedCodes.keys().next().value
    if (!oldest) break
    completedCodes.delete(oldest)
  }
}

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
    pruneCompletedCodes()
    const done = completedCodes.get(code)
    if (done) return done.result
    const ongoing = inflightCodes.get(code)
    if (ongoing) return ongoing
    const task = (async (): Promise<AuthCallback> => {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) throw error
      return first(params.type) === 'recovery' ? 'recovery' : 'session'
    })()
    inflightCodes.set(code, task)
    try {
      const result = await task
      completedCodes.set(code, { result, expires: Date.now() + COMPLETED_TTL_MS })
      return result
    } finally {
      inflightCodes.delete(code)
      pruneCompletedCodes()
    }
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
    // Implicit flow: supabase-js defaults to it and the email templates use
    // ConfirmationURL, so OAuth and recovery links carry tokens in the hash.
    // PKCE-only handling dropped these sessions entirely.
    const { error } = await supabase.auth.setSession({
      access_token: pairs!.access_token,
      refresh_token: pairs!.refresh_token,
    })
    if (error) throw error
    return pairs!.type === 'recovery' ? 'recovery' : 'session'
  }

  return null
}

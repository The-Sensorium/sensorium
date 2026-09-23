import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'

export type AssuranceLevel = 'aal1' | 'aal2'

export interface MfaStatus {
  currentLevel: AssuranceLevel
  nextLevel: AssuranceLevel
  verifiedTotpCount: number
  verifiedTotpIds: string[]
}

export function mfaStatusKey(userId: string) {
  return ['mfa', 'status', userId] as const
}

/** True when a signed-in session must complete the TOTP step before staff work. */
export function needsMfaVerify(status: MfaStatus | null | undefined): boolean {
  return status?.currentLevel === 'aal1' && status?.nextLevel === 'aal2'
}

/** Signed-in user's MFA assurance state plus verified TOTP factor count. */
export function useMfaStatus(enabled = true) {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null

  return useQuery({
    queryKey: mfaStatusKey(userId ?? 'signed-out'),
    enabled: userId !== null && enabled,
    queryFn: async (): Promise<MfaStatus> => {
      const supabase = requireSupabase()
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error) throw error
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError) throw factorsError
      const verified = (factors?.totp ?? []).filter((f) => f.status === 'verified')
      return {
        currentLevel: (data?.currentLevel ?? 'aal1') as AssuranceLevel,
        nextLevel: (data?.nextLevel ?? 'aal1') as AssuranceLevel,
        verifiedTotpCount: verified.length,
        verifiedTotpIds: verified.map((f) => f.id),
      }
    },
  })
}

export interface TotpEnrollment {
  factorId: string
  qrCode: string
  secret: string
  uri: string
}

/** Starts TOTP enrollment. Caller shows qrCode/secret, then confirms with a code. */
export async function enrollTotp(): Promise<TotpEnrollment> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error) throw error
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Enrolls, clearing abandoned unverified factors first. Auth applies the
 * delete asynchronously, so an immediate re-enroll can still conflict;
 * retry with backoff instead of surfacing the race to the user.
 */
export async function enrollTotpFresh(): Promise<TotpEnrollment> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await enrollTotp()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('already exists')) throw err
      lastError = err
      await unenrollUnverifiedTotpFactors()
      await sleep(400 * (attempt + 1))
    }
  }
  throw lastError
}

/** Verifies a 6-digit code against a factor: confirms fresh enrollments and
 * completes the AAL2 step on login for already-enrolled factors. */
export async function verifyTotpCode(factorId: string, code: string): Promise<void> {
  const supabase = requireSupabase()
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeError) throw challengeError
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  })
  if (error) throw error
}

/** Returns the verified TOTP factors available for the login challenge step. */
export async function listVerifiedTotpFactorIds(): Promise<string[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return (data?.totp ?? []).filter((f) => f.status === 'verified').map((f) => f.id)
}

/**
 * Removes abandoned enrollments (factors never confirmed with a code) so
 * starting setup again does not fail with "already exists". Note: listFactors
 * only puts verified factors in `totp`; unverified ones are in `all`.
 */
export async function unenrollUnverifiedTotpFactors(): Promise<void> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  const stale = (data?.all ?? []).filter((f) => f.factor_type === 'totp' && f.status !== 'verified')
  for (const factor of stale) {
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (unenrollError) throw unenrollError
  }
}

/** Removes a factor (settings reset or admin-guided recovery). */
export async function unenrollTotpFactor(factorId: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}

export function formatMfaError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error)
  if (message.includes('staff_mfa_required')) return 'Two-step verification is required for staff actions. Enter your authenticator code first.'
  if (message.includes('not_authenticated')) return 'Sign in first, then try again.'
  if (message.includes('already exists')) return 'A previous setup was left unfinished. Try again.'
  if (message.includes('AAL2 required')) return 'Verify your authenticator code first, then manage your factors.'
  return message
}

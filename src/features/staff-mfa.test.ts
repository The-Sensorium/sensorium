import { describe, expect, it, vi } from 'vitest'
import { formatMfaError, markMfaVerified, needsMfaVerify, type MfaStatus } from './staff-mfa'

function status(currentLevel: MfaStatus['currentLevel'], nextLevel: MfaStatus['nextLevel']): MfaStatus {
  return {
    currentLevel,
    nextLevel,
    verifiedTotpCount: currentLevel === 'aal2' ? 1 : 0,
    verifiedTotpIds: currentLevel === 'aal2' ? ['factor-1'] : [],
  }
}

describe('needsMfaVerify', () => {
  it('requires verification only for aal1 sessions that can reach aal2', () => {
    expect(needsMfaVerify(status('aal1', 'aal2'))).toBe(true)
    expect(needsMfaVerify(status('aal2', 'aal2'))).toBe(false)
    expect(needsMfaVerify(status('aal1', 'aal1'))).toBe(false)
    expect(needsMfaVerify(null)).toBe(false)
    expect(needsMfaVerify(undefined)).toBe(false)
  })
})

describe('formatMfaError', () => {
  it('maps staff MFA failures to friendly copy', () => {
    expect(formatMfaError(new Error('staff_mfa_required'))).toContain('Two-step verification')
    expect(formatMfaError(new Error('not_authenticated'))).toContain('Sign in first')
    expect(formatMfaError(new Error('A factor with the friendly name "" already exists'))).toContain(
      'left unfinished',
    )
    expect(formatMfaError(new Error('AAL2 required to unenroll verified factor'))).toContain(
      'Verify your authenticator code first',
    )
  })

  it('passes unknown messages through', () => {
    expect(formatMfaError(new Error('boom'))).toBe('boom')
  })
})

describe('markMfaVerified', () => {
  it('writes AAL2 to the cache with the verified factor merged in', () => {
    const queryClient = { setQueryData: vi.fn() }
    markMfaVerified(queryClient, 'u1', 'f1')
    expect(queryClient.setQueryData).toHaveBeenCalledWith(['mfa', 'status', 'u1'], expect.any(Function))
    const updater = queryClient.setQueryData.mock.calls[0][1] as (old: MfaStatus | undefined) => MfaStatus
    expect(
      updater({ currentLevel: 'aal1', nextLevel: 'aal2', verifiedTotpCount: 1, verifiedTotpIds: ['f1'] }),
    ).toEqual({ currentLevel: 'aal2', nextLevel: 'aal2', verifiedTotpCount: 1, verifiedTotpIds: ['f1'] })
  })

  it('adds a newly verified factor to previously cached ids', () => {
    const queryClient = { setQueryData: vi.fn() }
    markMfaVerified(queryClient, 'u1', 'f2')
    const updater = queryClient.setQueryData.mock.calls[0][1] as (old: MfaStatus | undefined) => MfaStatus
    expect(
      updater({ currentLevel: 'aal1', nextLevel: 'aal2', verifiedTotpCount: 1, verifiedTotpIds: ['f1'] }),
    ).toEqual({ currentLevel: 'aal2', nextLevel: 'aal2', verifiedTotpCount: 2, verifiedTotpIds: ['f1', 'f2'] })
  })

  it('keeps count consistent with ids when no cached data exists', () => {
    const queryClient = { setQueryData: vi.fn() }
    markMfaVerified(queryClient, 'u1')
    const updater = queryClient.setQueryData.mock.calls[0][1] as (old: MfaStatus | undefined) => MfaStatus
    expect(updater(undefined)).toEqual({
      currentLevel: 'aal2',
      nextLevel: 'aal2',
      verifiedTotpCount: 0,
      verifiedTotpIds: [],
    })
  })
})

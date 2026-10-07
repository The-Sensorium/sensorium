import { describe, expect, it } from 'vitest'
import { isJwtExpiredError, isPermanentQueryError } from './query-retry'

describe('isJwtExpiredError', () => {
  it('returns true for an expired-token PostgREST error (PGRST301)', () => {
    expect(isJwtExpiredError({ message: 'JWT expired', code: 'PGRST301', hint: '', details: '' })).toBe(true)
  })

  it('returns false for a non-expiry auth error', () => {
    expect(isJwtExpiredError({ message: 'JWSError JWSInvalidSignature', code: 'PGRST301', hint: '', details: '' })).toBe(false)
  })

  it('returns false when expiry wording is not about the JWT', () => {
    expect(isJwtExpiredError({ message: 'expiration claim missing', code: 'PGRST301', hint: '', details: '' })).toBe(false)
  })

  it('returns false for a non-expired JWT problem even with expiry-adjacent wording', () => {
    expect(isJwtExpiredError({ message: 'JWT expiration claim missing', code: 'PGRST301', hint: '', details: '' })).toBe(false)
  })

  it('returns false for non-PostgREST codes and non-objects', () => {
    expect(isJwtExpiredError({ message: 'JWT expired', code: '42501', hint: '', details: '' })).toBe(false)
    expect(isJwtExpiredError(new Error('JWT expired'))).toBe(false)
    expect(isJwtExpiredError(undefined)).toBe(false)
  })
})

describe('isPermanentQueryError', () => {
  it('returns true for an RLS permission-denied code (42501)', () => {
    expect(isPermanentQueryError({ message: 'denied', code: '42501', hint: '', details: '' })).toBe(true)
  })

  it('returns true for a non-expiry PostgREST auth error (PGRST301)', () => {
    expect(isPermanentQueryError({ message: 'JWSError JWSInvalidSignature', code: 'PGRST301', hint: '', details: '' })).toBe(true)
  })

  it('returns false for an expired-token error so the retry budget applies after refresh', () => {
    expect(isPermanentQueryError({ message: 'JWT expired', code: 'PGRST301', hint: '', details: '' })).toBe(false)
  })

  it('returns true for expiry wording that is not about the JWT', () => {
    expect(isPermanentQueryError({ message: 'expiration claim missing', code: 'PGRST301', hint: '', details: '' })).toBe(true)
  })

  it('returns true for a non-expired JWT problem even with expiry-adjacent wording', () => {
    expect(isPermanentQueryError({ message: 'JWT expiration claim missing', code: 'PGRST301', hint: '', details: '' })).toBe(true)
  })

  it('returns true for a PostgREST anonymous-access error (PGRST306)', () => {
    expect(isPermanentQueryError({ message: 'anonymous', code: 'PGRST306', hint: '', details: '' })).toBe(true)
  })

  it('returns false for an Error without a code', () => {
    expect(isPermanentQueryError(new Error('network down'))).toBe(false)
  })

  it('returns false for a transient Postgres code', () => {
    expect(isPermanentQueryError({ message: 'deadlock', code: '40P01', hint: '', details: '' })).toBe(false)
  })

  it('returns false for non-object errors', () => {
    expect(isPermanentQueryError(undefined)).toBe(false)
    expect(isPermanentQueryError('boom')).toBe(false)
  })
})

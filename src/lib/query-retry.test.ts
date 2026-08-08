import { describe, expect, it } from 'vitest'
import { isPermanentQueryError } from './query-retry'

describe('isPermanentQueryError', () => {
  it('returns true for an RLS permission-denied code (42501)', () => {
    expect(isPermanentQueryError({ message: 'denied', code: '42501', hint: '', details: '' })).toBe(true)
  })

  it('returns true for a PostgREST permission error (PGRST301)', () => {
    expect(isPermanentQueryError({ message: 'denied', code: 'PGRST301', hint: '', details: '' })).toBe(true)
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

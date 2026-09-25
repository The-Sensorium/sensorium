import { describe, expect, it, vi } from 'vitest'
import { CALL_TOKEN_RATE_LIMITED, toCallTokenError } from './cluster-calls'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))

describe('toCallTokenError', () => {
  it('maps HTTP 429 to the rate-limit error', () => {
    expect(toCallTokenError({ message: 'slow down', context: { status: 429 } }).message).toBe(
      CALL_TOKEN_RATE_LIMITED,
    )
    expect(toCallTokenError({ status: 429 }).message).toBe(CALL_TOKEN_RATE_LIMITED)
  })

  it('passes other errors through', () => {
    const other = new Error('not_member')
    expect(toCallTokenError(other)).toBe(other)
    expect(toCallTokenError({ status: 403 }).message).toBe('No token')
    expect(toCallTokenError(null).message).toBe('No token')
  })
})

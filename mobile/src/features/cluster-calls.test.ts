import { describe, expect, it, vi } from 'vitest'
import { CALL_TOKEN_RATE_LIMITED, pickIncomingCall, toCallTokenError, type Call } from './cluster-calls'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))

function ringing(overrides: Partial<Call> = {}): Call {
  return {
    id: 'call-1',
    cluster_id: 'cluster-1',
    initiated_by: 'someone',
    status: 'ringing',
    created_at: '2026-01-01T00:00:00Z',
    ended_at: null,
    expires_at: '2026-01-01T00:30:00Z',
    ...overrides,
  }
}

describe('pickIncomingCall', () => {
  it('picks the newest ringing call from someone else', () => {
    const calls = [ringing(), ringing({ id: 'call-2' })]
    expect(pickIncomingCall(calls, 'me')?.id).toBe('call-1')
  })

  it('ignores the caller own call and non-ringing calls', () => {
    expect(pickIncomingCall([ringing({ initiated_by: 'me' })], 'me')).toBeNull()
    expect(pickIncomingCall([ringing({ status: 'active' })], 'me')).toBeNull()
    expect(pickIncomingCall([ringing({ status: 'ended' })], 'me')).toBeNull()
  })

  it('returns null without a signed-in user', () => {
    expect(pickIncomingCall([ringing()], null)).toBeNull()
  })
})

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

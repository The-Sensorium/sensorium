import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({
  requireSupabase: () => {
    throw new Error('no db in unit test')
  },
}))

import { isTabTarget, pushDataToHref } from './notification-routing'

describe('isTabTarget', () => {
  it('recognizes the five tab routes', () => {
    expect(isTabTarget('/home')).toBe(true)
    expect(isTabTarget('/posts')).toBe(true)
    expect(isTabTarget('/notifications')).toBe(true)
    expect(isTabTarget('/clusters')).toBe(true)
    expect(isTabTarget('/settings')).toBe(true)
  })

  it('rejects detail routes', () => {
    expect(isTabTarget({ pathname: '/posts/[postId]', params: { postId: 'p1' } })).toBe(false)
    expect(isTabTarget({ pathname: '/profile/[userId]', params: { userId: 'u1' } })).toBe(false)
    expect(isTabTarget('/cluster-created')).toBe(false)
  })
})

describe('pushDataToHref', () => {
  it('opens the call screen for an incoming call', () => {
    expect(
      pushDataToHref({ kind: 'incoming_call', clusterId: 'cluster-1', callId: 'call-1' }),
    ).toEqual({
      pathname: '/cluster/[clusterId]/call',
      params: { clusterId: 'cluster-1', callId: 'call-1' },
    })
  })

  it('falls back to the room when a call id is missing', () => {
    expect(pushDataToHref({ kind: 'incoming_call', clusterId: 'cluster-1' })).toEqual({
      pathname: '/cluster/[clusterId]/room',
      params: { clusterId: 'cluster-1' },
    })
  })
})

import { describe, expect, it } from 'vitest'
import { postsSeenKey, resolveSeenAt } from './posts-seen'

const NOW = new Date('2026-05-01T12:00:00.000Z')

describe('postsSeenKey', () => {
  it('scopes the watermark to the signed-in user', () => {
    expect(postsSeenKey('u1')).toBe('sensorium:posts-seen:u1')
    expect(postsSeenKey('u1')).not.toBe(postsSeenKey('u2'))
  })
})

describe('resolveSeenAt', () => {
  it('uses a valid past watermark', () => {
    expect(resolveSeenAt('2026-04-30T08:00:00.000Z', NOW)).toBe('2026-04-30T08:00:00.000Z')
  })

  it('falls back to now on a first run', () => {
    expect(resolveSeenAt(null, NOW)).toBe(NOW.toISOString())
  })

  it('falls back to now on a corrupt value', () => {
    expect(resolveSeenAt('not-a-date', NOW)).toBe(NOW.toISOString())
  })

  it('falls back to now when the clock moved backwards', () => {
    expect(resolveSeenAt('2026-05-02T00:00:00.000Z', NOW)).toBe(NOW.toISOString())
  })
})

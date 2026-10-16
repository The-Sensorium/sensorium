import { describe, expect, it } from 'vitest'
import {
  activeDurationKey,
  formatMuteExpiry,
  isClusterPushMuted,
  MUTE_DURATIONS,
  mutedUntilForDuration,
  mutedUntilCopy,
} from './cluster-mute'

const NOW = new Date('2026-10-16T12:00:00Z').getTime()

describe('isClusterPushMuted', () => {
  it('reads a missing timestamp as unmuted', () => {
    expect(isClusterPushMuted(null, NOW)).toBe(false)
    expect(isClusterPushMuted(undefined, NOW)).toBe(false)
  })

  it('reads a future timestamp as muted and a past one as unmuted', () => {
    expect(isClusterPushMuted(new Date(NOW + 1000).toISOString(), NOW)).toBe(true)
    expect(isClusterPushMuted(new Date(NOW - 1000).toISOString(), NOW)).toBe(false)
  })

  it('reads infinity as muted and garbage as unmuted', () => {
    expect(isClusterPushMuted('infinity', NOW)).toBe(true)
    expect(isClusterPushMuted('not-a-date', NOW)).toBe(false)
  })
})

describe('mutedUntilForDuration', () => {
  it('offers the specified durations in order', () => {
    expect(MUTE_DURATIONS.map((d) => d.label)).toEqual([
      '1 hour',
      '8 hours',
      '1 day',
      'Until I turn it back on',
    ])
  })

  it('stores an ISO expiry offset by the duration', () => {
    expect(mutedUntilForDuration('hour', NOW)).toBe(new Date(NOW + 3_600_000).toISOString())
    expect(mutedUntilForDuration('eight_hours', NOW)).toBe(new Date(NOW + 8 * 3_600_000).toISOString())
    expect(mutedUntilForDuration('day', NOW)).toBe(new Date(NOW + 24 * 3_600_000).toISOString())
  })

  it('stores infinity for indefinite', () => {
    expect(mutedUntilForDuration('indefinite', NOW)).toBe('infinity')
  })

  it('rejects unknown durations', () => {
    expect(() => mutedUntilForDuration('week' as never, NOW)).toThrow()
  })
})

describe('activeDurationKey', () => {
  it('returns null when unmuted', () => {
    expect(activeDurationKey(null, NOW)).toBeNull()
    expect(activeDurationKey(undefined, NOW)).toBeNull()
    expect(activeDurationKey(new Date(NOW - 1000).toISOString(), NOW)).toBeNull()
  })

  it('recognizes a just-picked duration and indefinite', () => {
    expect(activeDurationKey(mutedUntilForDuration('hour', NOW), NOW)).toBe('hour')
    expect(activeDurationKey(mutedUntilForDuration('eight_hours', NOW), NOW)).toBe('eight_hours')
    expect(activeDurationKey(mutedUntilForDuration('day', NOW), NOW)).toBe('day')
    expect(activeDurationKey('infinity', NOW)).toBe('indefinite')
  })

  it('returns null for an older mute instead of a wrong check', () => {
    expect(activeDurationKey(new Date(NOW + 30 * 60_000).toISOString(), NOW)).toBeNull()
  })
})

describe('mutedUntilCopy', () => {
  function atMidnight(): number {
    const base = new Date(NOW)
    base.setHours(0, 0, 0, 0)
    return base.getTime()
  }

  it('returns null when unmuted', () => {
    expect(mutedUntilCopy('Aurora', null, NOW)).toBeNull()
    expect(mutedUntilCopy('Aurora', new Date(NOW - 1000).toISOString(), NOW)).toBeNull()
  })

  it('names today and tomorrow expiries', () => {
    const morning = atMidnight() + 9 * 3_600_000
    const evening = new Date(atMidnight() + 18 * 3_600_000 + 32 * 60_000)
    expect(formatMuteExpiry(evening.toISOString(), morning)).toBe('today at 6:32 PM')
    const nextEvening = new Date(atMidnight() + 24 * 3_600_000 + 18 * 3_600_000 + 32 * 60_000)
    expect(formatMuteExpiry(nextEvening.toISOString(), morning)).toBe('tomorrow at 6:32 PM')
    expect(mutedUntilCopy('Aurora', nextEvening.toISOString(), morning)).toBe(
      'Aurora is muted until tomorrow at 6:32 PM.',
    )
  })

  it('falls back to a short date past tomorrow', () => {
    const morning = atMidnight() + 9 * 3_600_000
    const later = new Date(atMidnight() + 5 * 86_400_000 + 3_600_000)
    expect(formatMuteExpiry(later.toISOString(), morning)).toMatch(/ at \d{1,2}:\d{2} (AM|PM)$/)
  })

  it('covers indefinite and unparsable values', () => {
    expect(mutedUntilCopy('Aurora', 'infinity', NOW)).toBe(
      'Aurora is muted until you turn notifications back on.',
    )
    expect(formatMuteExpiry('infinity', NOW)).toBeNull()
    expect(formatMuteExpiry('not-a-date', NOW)).toBeNull()
  })
})

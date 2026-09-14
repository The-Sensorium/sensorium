import { describe, expect, it } from 'vitest'
import { formatCallDuration } from './format'

describe('formatCallDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatCallDuration(0)).toBe('0:00')
    expect(formatCallDuration(5)).toBe('0:05')
    expect(formatCallDuration(65)).toBe('1:05')
    expect(formatCallDuration(59 * 60 + 59)).toBe('59:59')
  })

  it('formats hours once past an hour', () => {
    expect(formatCallDuration(3600)).toBe('1:00:00')
    expect(formatCallDuration(3661)).toBe('1:01:01')
  })

  it('clamps invalid or negative input to zero', () => {
    expect(formatCallDuration(-5)).toBe('0:00')
    expect(formatCallDuration(Number.NaN)).toBe('0:00')
    expect(formatCallDuration(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})

import { describe, expect, it } from 'vitest'
import { badgeLabel } from './tab-badge'

describe('badgeLabel', () => {
  it('returns undefined when there is nothing unread', () => {
    expect(badgeLabel(0)).toBeUndefined()
    expect(badgeLabel(-3)).toBeUndefined()
  })

  it('returns the count for 1 to 9', () => {
    expect(badgeLabel(1)).toBe('1')
    expect(badgeLabel(9)).toBe('9')
  })

  it('caps large counts at 9+', () => {
    expect(badgeLabel(10)).toBe('9+')
    expect(badgeLabel(128)).toBe('9+')
  })
})

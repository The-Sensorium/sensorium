import { describe, expect, it } from 'vitest'
import { withAlpha } from './theme-tokens'

describe('withAlpha', () => {
  it('appends an 8-bit alpha channel to a hex token', () => {
    expect(withAlpha('#93000a', 0.4)).toBe('#93000a66')
    expect(withAlpha('#ffdad6', 0.4)).toBe('#ffdad666')
  })

  it('clamps the alpha to the 0 to 1 range', () => {
    expect(withAlpha('#93000a', 0)).toBe('#93000a00')
    expect(withAlpha('#93000a', 1)).toBe('#93000aff')
    expect(withAlpha('#93000a', 2)).toBe('#93000aff')
    expect(withAlpha('#93000a', -1)).toBe('#93000a00')
  })

  it('keeps an existing alpha channel out of the result', () => {
    expect(withAlpha('#93000a80', 0.4)).toBe('#93000a66')
  })
})

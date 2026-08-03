import { describe, expect, it } from 'vitest'
import { MATCHING_MODES, isMatchingMode, modeInfo } from './modes'

describe('modes', () => {
  it('defines exactly the five birth/location modes', () => {
    expect(MATCHING_MODES.map((m) => m.value)).toEqual([
      'exact_birthdate',
      'birth_year_month',
      'birth_month',
      'birth_year',
      'local',
    ])
  })

  it('modeInfo returns the matching entry with a label and detail', () => {
    const info = modeInfo('birth_year')
    expect(info.label).toBe('Birth Year')
    expect(info.detail).toContain('same year')
  })

  it('modeInfo throws for an unknown mode', () => {
    expect(() => modeInfo('not_a_mode')).toThrow(/Unknown matching mode/)
  })

  it('isMatchingMode guards the union', () => {
    expect(isMatchingMode('exact_birthdate')).toBe(true)
    expect(isMatchingMode('local')).toBe(true)
    expect(isMatchingMode('interest')).toBe(false)
  })
})
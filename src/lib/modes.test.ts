import { describe, expect, it } from 'vitest'
import { MATCHING_MODES, cooldownDaysForMode, isMatchingMode, modeInfo } from './modes'

describe('modes', () => {
  it('defines exactly the six birth/location/open modes', () => {
    expect(MATCHING_MODES.map((m) => m.value)).toEqual([
      'exact_birthdate',
      'birth_year_month',
      'generation',
      'birth_year',
      'local',
      'open_mix',
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
    expect(isMatchingMode('generation')).toBe(true)
    expect(isMatchingMode('local')).toBe(true)
    expect(isMatchingMode('open_mix')).toBe(true)
    expect(isMatchingMode('interest')).toBe(false)
    expect(isMatchingMode('birth_month')).toBe(false)
  })

  it('modeInfo covers generation', () => {
    const info = modeInfo('generation')
    expect(info.label).toBe('Generation')
    expect(info.detail).toContain('same 5 years')
  })

  it('modeInfo covers open_mix', () => {
    const info = modeInfo('open_mix')
    expect(info.label).toBe('Open Mix')
    expect(info.detail).toContain('First 8')
  })

  it('cooldownDaysForMode is 7 for open_mix and 30 otherwise', () => {
    expect(cooldownDaysForMode('open_mix')).toBe(7)
    expect(cooldownDaysForMode('birth_year')).toBe(30)
    expect(cooldownDaysForMode('generation')).toBe(30)
    expect(cooldownDaysForMode('local')).toBe(30)
  })
})
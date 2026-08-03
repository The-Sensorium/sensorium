import { describe, expect, it } from 'vitest'
import {
  EMPTY_DRAFT,
  MIN_AGE,
  ageOnDate,
  isValidDate,
  validateStep,
} from '../onboarding/draft'

describe('isValidDate', () => {
  it('accepts a real date in YYYY-MM-DD', () => {
    expect(isValidDate('1996-07-12')).toBe(true)
  })

  it('rejects malformed, non-calendar, and impossible dates', () => {
    expect(isValidDate('')).toBe(false)
    expect(isValidDate('1996-7-12')).toBe(false)
    expect(isValidDate('1996-13-01')).toBe(false)
    expect(isValidDate('1996-02-31')).toBe(false)
  })
})

describe('ageOnDate', () => {
  it('computes wall-clock age for a known birthday', () => {
    expect(ageOnDate('1996-07-12', new Date(Date.UTC(2026, 6, 12)))).toBe(30)
    expect(ageOnDate('1996-07-12', new Date(Date.UTC(2026, 6, 11)))).toBe(29)
  })

  it('returns -1 for an invalid date', () => {
    expect(ageOnDate('not-a-date')).toBe(-1)
  })

  it('is 18 exactly at the minimum legal date', () => {
    expect(ageOnDate('2008-01-01', new Date(Date.UTC(2026, 0, 1)))).toBe(MIN_AGE)
  })
})

describe('validateStep', () => {
  it('step 1 requires a valid, adult birthdate, name and country', () => {
    expect(validateStep(1, EMPTY_DRAFT)).toBe('Please enter your display name.')

    const adult = { ...EMPTY_DRAFT, displayName: 'Diya', dob: '1996-07-12' }
    expect(validateStep(1, adult)).toBe('Please select your country.')

    const complete = { ...adult, countryCode: 'PT' }
    expect(validateStep(1, complete)).toBeNull()

    const minor = { ...adult, dob: '2012-01-01' }
    expect(validateStep(1, minor)).toContain('18')
  })

  it('step 3 requires at least one mode', () => {
    expect(validateStep(3, EMPTY_DRAFT)).toBe('Pick at least one matching mode.')
    expect(validateStep(3, { ...EMPTY_DRAFT, selectedModes: ['local'] })).toBeNull()
  })

  it('step 4 enforces location + radius only when Local is selected', () => {
    expect(validateStep(4, { ...EMPTY_DRAFT, selectedModes: ['birth_year'] })).toBeNull()
    expect(validateStep(4, { ...EMPTY_DRAFT, selectedModes: ['local'] })).toBe(
      'Share your location to join the Local mode.',
    )
  })

  it('unknown steps validate clean', () => {
    expect(validateStep(99, EMPTY_DRAFT)).toBeNull()
  })
})
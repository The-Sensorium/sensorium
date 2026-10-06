import { describe, expect, it } from 'vitest'
import { isProfileMissingError, ProfileMissingError, resolveProfileData } from './profile-missing'
import { isPermanentQueryError } from './query-retry'

describe('resolveProfileData', () => {
  it('returns the row when present', () => {
    expect(resolveProfileData({ id: 'u1' }, null)).toEqual({ id: 'u1' })
  })

  it('rethrows query errors unchanged', () => {
    const failure = new Error('network down')
    expect(() => resolveProfileData(null, failure)).toThrow(failure)
  })

  it('throws ProfileMissingError on an empty success so it is retried, never routed on', () => {
    expect(() => resolveProfileData(null, null)).toThrow(ProfileMissingError)
    expect(() => resolveProfileData(undefined, null)).toThrow(ProfileMissingError)
  })

  it('identifies the missing error', () => {
    expect(isProfileMissingError(new ProfileMissingError())).toBe(true)
    expect(isProfileMissingError(new Error('other'))).toBe(false)
    expect(isProfileMissingError(null)).toBe(false)
  })

  it('identifies a duck-typed missing error across realms', () => {
    const dupe = new Error('Profile not found')
    dupe.name = 'ProfileMissingError'
    expect(isProfileMissingError(dupe)).toBe(true)
  })

  it('stays retryable under the global retry classifier', () => {
    expect(isPermanentQueryError(new ProfileMissingError())).toBe(false)
  })
})

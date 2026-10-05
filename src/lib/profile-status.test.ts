import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_STATUS,
  PROFILE_STATUSES,
  isProfileStatus,
  profileStatusMeta,
  resolveDisplayStatus,
} from './profile-status'

describe('profile-status', () => {
  it('defines the four manual statuses in order', () => {
    expect(PROFILE_STATUSES.map((s) => s.value)).toEqual([
      'online',
      'away',
      'busy',
      'invisible',
    ])
  })

  it('defaults to online', () => {
    expect(DEFAULT_PROFILE_STATUS).toBe('online')
  })

  it('returns metadata for a known status', () => {
    expect(profileStatusMeta('away')).toMatchObject({ label: 'Away' })
    expect(profileStatusMeta('invisible').description).toContain('radar')
  })

  it('falls back for an unknown status', () => {
    expect(profileStatusMeta('gaming' as never).label).toBe('gaming')
  })

  it('guards valid status values', () => {
    expect(isProfileStatus('busy')).toBe(true)
    expect(isProfileStatus('offline')).toBe(false)
    expect(isProfileStatus(null)).toBe(false)
    expect(isProfileStatus(undefined)).toBe(false)
  })

  it('never shows an offline person as online', () => {
    expect(resolveDisplayStatus(false, 'online')).toBe('offline')
    expect(resolveDisplayStatus(false, 'away')).toBe('offline')
    expect(resolveDisplayStatus(false, null)).toBe('offline')
  })

  it('shows the manual status when actually online', () => {
    expect(resolveDisplayStatus(true, 'online')).toBe('online')
    expect(resolveDisplayStatus(true, 'away')).toBe('away')
    expect(resolveDisplayStatus(true, 'busy')).toBe('busy')
  })

  it('reads invisible as offline even while online', () => {
    expect(resolveDisplayStatus(true, 'invisible')).toBe('offline')
  })

  it('falls back to online for unknown values', () => {
    expect(resolveDisplayStatus(true, null)).toBe('online')
    expect(resolveDisplayStatus(true, 'gaming')).toBe('online')
  })
})

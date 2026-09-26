import { describe, expect, it } from 'vitest'
import { defaultTimeZone, formatMemberTime, isValidTimeZone, timeZoneList } from './timezones'

describe('timezones', () => {
  it('accepts real IANA zones and rejects junk', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true)
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true)
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })

  it('returns the same bundled list on every engine', () => {
    const list = timeZoneList()
    expect(list.length).toBe(421)
    expect(list).toContain('America/New_York')
    expect(list).toContain('Europe/Lisbon')
    expect(list).toContain('Asia/Kolkata')
    expect(list).toContain('Europe/Kyiv')
    expect(list).toContain('Pacific/Auckland')
  })

  it('formats member time like the mockup', () => {
    const now = new Date('2026-01-15T12:06:00Z')
    expect(formatMemberTime(now, 'America/New_York')).toBe('7:06 AM')
    expect(formatMemberTime(now, 'Asia/Kolkata')).toBe('5:36 PM')
  })

  it('detects a usable default zone or null', () => {
    const tz = defaultTimeZone()
    expect(tz === null || isValidTimeZone(tz)).toBe(true)
  })
})

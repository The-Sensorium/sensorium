import { describe, expect, it } from 'vitest'
import {
  defaultTimeZone,
  formatMemberTime,
  getMemberHour,
  isMemberDaytime,
  isValidTimeZone,
  timeZoneList,
} from './timezones'

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

  it('reads the member hour in the member zone', () => {
    const now = new Date('2026-01-15T12:06:00Z')
    expect(getMemberHour(now, 'America/New_York')).toBe(7)
    expect(getMemberHour(now, 'Asia/Kolkata')).toBe(17)
    expect(getMemberHour(now, 'Not/AZone')).toBe(null)
  })

  it('marks 6am to 8pm as daytime', () => {
    expect(isMemberDaytime(new Date('2026-06-01T10:00:00Z'), 'UTC')).toBe(true)
    expect(isMemberDaytime(new Date('2026-06-01T04:00:00Z'), 'UTC')).toBe(false)
    expect(isMemberDaytime(new Date('2026-06-01T05:59:00Z'), 'UTC')).toBe(false)
    expect(isMemberDaytime(new Date('2026-06-01T06:00:00Z'), 'UTC')).toBe(true)
    expect(isMemberDaytime(new Date('2026-06-01T19:59:00Z'), 'UTC')).toBe(true)
    expect(isMemberDaytime(new Date('2026-06-01T20:00:00Z'), 'UTC')).toBe(false)
    expect(isMemberDaytime(new Date('2026-06-01T12:00:00Z'), 'Not/AZone')).toBe(null)
  })
})

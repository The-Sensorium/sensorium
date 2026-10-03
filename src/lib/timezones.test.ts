import { describe, expect, it } from 'vitest'
import {
  defaultTimeZone,
  formatMemberTime,
  formatMemberTimePadded,
  formatSlotInZone,
  getDayPeriod,
  getMemberHour,
  isMemberDaytime,
  isValidTimeZone,
  timeZoneList,
  zonedDateInput,
  zonedTimeInput,
  zonedTimeToISO,
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

  it('pads single-digit hours for aligned columns', () => {
    const now = new Date('2026-01-15T12:06:00Z')
    expect(formatMemberTimePadded(now, 'America/New_York')).toBe('07:06 AM')
    expect(formatMemberTimePadded(now, 'Asia/Kolkata')).toBe('05:36 PM')
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

  it('converts wall time in a zone to the right UTC instant', () => {
    expect(zonedTimeToISO('2026-10-05', '18:30', 'Asia/Kolkata')).toBe('2026-10-05T13:00:00.000Z')
    expect(zonedTimeToISO('2026-01-15', '07:00', 'America/New_York')).toBe('2026-01-15T12:00:00.000Z')
    expect(zonedTimeToISO('2026-07-15', '07:00', 'America/New_York')).toBe('2026-07-15T11:00:00.000Z')
  })

  it('rejects bad shapes, impossible dates, and bad zones', () => {
    expect(zonedTimeToISO('', '18:30', 'Asia/Kolkata')).toBeNull()
    expect(zonedTimeToISO('2026-10-05', '', 'Asia/Kolkata')).toBeNull()
    expect(zonedTimeToISO('10/05/2026', '18:30', 'Asia/Kolkata')).toBeNull()
    expect(zonedTimeToISO('2026-10-05', '6:30 PM', 'Asia/Kolkata')).toBeNull()
    expect(zonedTimeToISO('2026-02-30', '12:00', 'Asia/Kolkata')).toBeNull()
    expect(zonedTimeToISO('2026-10-05', '25:00', 'Asia/Kolkata')).toBeNull()
    expect(zonedTimeToISO('2026-10-05', '18:30', 'Bogus/Zone')).toBeNull()
  })

  it('rejects nonexistent wall times and keeps ambiguous ones', () => {
    // US springs forward on 2026-03-08: 02:30 never happens in New York.
    expect(zonedTimeToISO('2026-03-08', '02:30', 'America/New_York')).toBeNull()
    // US falls back on 2026-11-01: 01:30 happens twice; either is accepted.
    expect(zonedTimeToISO('2026-11-01', '01:30', 'America/New_York')).not.toBeNull()
  })

  it('renders date, time, and full slot labels in a zone', () => {
    expect(zonedDateInput('2026-10-05T13:00:00.000Z', 'Asia/Kolkata')).toBe('2026-10-05')
    expect(zonedTimeInput('2026-10-05T13:00:00.000Z', 'Asia/Kolkata')).toBe('18:30')
    expect(zonedDateInput('2026-10-05T13:00:00.000Z', 'America/New_York')).toBe('2026-10-05')
    expect(zonedTimeInput('2026-10-05T13:00:00.000Z', 'America/New_York')).toBe('09:00')
    expect(zonedDateInput('bogus', 'Asia/Kolkata')).toBeNull()
    expect(zonedTimeInput('2026-10-05T13:00:00.000Z', 'Bogus/Zone')).toBeNull()
    expect(formatSlotInZone('2026-10-05T13:00:00.000Z', 'Asia/Kolkata')).toBe('Monday, Oct 5 at 6:30 PM')
    expect(formatSlotInZone('2026-10-05T13:00:00.000Z', 'Bogus/Zone')).toBeNull()
  })

  it('splits the night into late evening and early morning', () => {
    expect(getDayPeriod(new Date('2026-06-01T05:59:00Z'), 'UTC')).toBe('early')
    expect(getDayPeriod(new Date('2026-06-01T00:00:00Z'), 'UTC')).toBe('early')
    expect(getDayPeriod(new Date('2026-06-01T06:00:00Z'), 'UTC')).toBe('day')
    expect(getDayPeriod(new Date('2026-06-01T19:59:00Z'), 'UTC')).toBe('day')
    expect(getDayPeriod(new Date('2026-06-01T20:00:00Z'), 'UTC')).toBe('late')
    expect(getDayPeriod(new Date('2026-06-01T23:59:00Z'), 'UTC')).toBe('late')
    expect(getDayPeriod(new Date('2026-06-01T12:00:00Z'), 'Not/AZone')).toBe(null)
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

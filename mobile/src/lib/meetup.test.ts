import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({
  requireSupabase: () => {
    throw new Error('no db in unit test')
  },
}))

import { MEETUP_MAX_SLOTS, MEETUP_QUORUM, canJoinMeetup, customRowToISO, defaultCustomStart, formatPillDate, formatSlotCompact24, formatSlotDay, formatSlotDot, formatSlotForMember, formatSlotShort, formatSlotShortDot, hasEnded, hasQuorum, hasStarted, isCustomSlotValid, isLive, metThisWeek, nextSevenMidnights, pluralize, previewSlotMembers, winningSlot } from './meetup'
import { appPathToHref, pushDataToHref } from './notification-routing'

describe('meetup helpers', () => {
  it('formats slots with date and time', () => {
    expect(formatSlotShort('2026-10-11T19:00:00.000Z')).toContain('Oct')
  })

  it('detects quorum at exactly 3 votes', () => {
    expect(MEETUP_QUORUM).toBe(3)
    expect(hasQuorum([{ vote_count: 2 }, { vote_count: 3 }])).toBe(true)
    expect(hasQuorum([{ vote_count: 2 }])).toBe(false)
  })

  it('picks the deterministic winner by votes then earliest start', () => {
    const slots = [
      { id: 'b', starts_at: '2026-10-12T19:00:00.000Z', ends_at: '2026-10-12T20:00:00.000Z', vote_count: 3 },
      { id: 'a', starts_at: '2026-10-11T19:00:00.000Z', ends_at: '2026-10-11T20:00:00.000Z', vote_count: 3 },
    ]
    expect(winningSlot(slots)?.id).toBe('a')
  })

  it('reports started only for past instants', () => {
    const now = Date.now()
    expect(hasStarted(new Date(now - 1000).toISOString(), now)).toBe(true)
    expect(hasStarted(new Date(now + 60_000).toISOString(), now)).toBe(false)
    expect(hasStarted(null, now)).toBe(false)
    expect(hasStarted('bogus', now)).toBe(false)
  })

  it('enables join only in the join window', () => {
    const start = new Date('2026-10-11T19:00:00.000Z').getTime()
    expect(canJoinMeetup('2026-10-11T19:00:00.000Z', start - 11 * 60_000)).toBe(false)
    expect(canJoinMeetup('2026-10-11T19:00:00.000Z', start - 9 * 60_000)).toBe(true)
    expect(canJoinMeetup(null)).toBe(false)
  })

  it('reports live only between start and end', () => {
    const start = new Date('2026-10-11T19:00:00.000Z').getTime()
    const end = new Date('2026-10-11T20:00:00.000Z').toISOString()
    const startIso = new Date(start).toISOString()
    expect(isLive(startIso, end, start - 1000)).toBe(false)
    expect(isLive(startIso, end, start + 5 * 60_000)).toBe(true)
    expect(isLive(startIso, end, start + 60 * 60_000)).toBe(true)
    expect(isLive(startIso, end, start + 60 * 60_000 + 1000)).toBe(false)
    expect(isLive(null, end)).toBe(false)
    expect(isLive(startIso, null)).toBe(false)
    expect(isLive('bogus', end)).toBe(false)
  })

  it('reports ended once past the end', () => {
    const end = new Date('2026-10-11T20:00:00.000Z')
    expect(hasEnded(end.toISOString(), end.getTime() - 1000)).toBe(false)
    expect(hasEnded(end.toISOString(), end.getTime())).toBe(false)
    expect(hasEnded(end.toISOString(), end.getTime() + 1000)).toBe(true)
    expect(hasEnded(null)).toBe(false)
    expect(hasEnded('bogus')).toBe(false)
  })

  it('allows 4 suggested plus one custom slot', () => {
    expect(MEETUP_MAX_SLOTS).toBe(5)
  })

  it('validates custom slots between 3h and 7d out', () => {
    const now = Date.now()
    const iso = (ms: number) => new Date(now + ms).toISOString()
    expect(isCustomSlotValid(iso(2 * 3600_000), now)).toBe(false)
    expect(isCustomSlotValid(iso(3 * 3600_000), now)).toBe(true)
    expect(isCustomSlotValid(iso(6 * 24 * 3600_000), now)).toBe(true)
    expect(isCustomSlotValid(iso(8 * 24 * 3600_000), now)).toBe(false)
    expect(isCustomSlotValid('bogus', now)).toBe(false)
  })

  it('prefills the first row with next Saturday 7pm local', () => {
    const start = defaultCustomStart(new Date('2026-10-03T12:00:00'))
    expect(start.getDay()).toBe(6)
    expect(start.getHours()).toBe(19)
    expect(start.getTime()).toBeGreaterThan(new Date('2026-10-03T12:00:00').getTime())
  })

  it('prefills a submittable row late on Saturday when 7pm is in the dead zone', () => {
    const now = new Date('2026-10-03T16:01:00')
    const start = defaultCustomStart(now)
    expect(start.getDay()).toBe(0)
    expect(start.getHours()).toBe(19)
    expect(isCustomSlotValid(start.toISOString(), now.getTime())).toBe(true)
  })

  it('prefills a submittable row at every hour of the week', () => {
    const base = new Date('2026-10-04T00:00:00')
    for (let day = 0; day < 7; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const now = new Date(base)
        now.setDate(base.getDate() + day)
        now.setHours(hour, 0, 0, 0)
        const start = defaultCustomStart(now)
        expect(isCustomSlotValid(start.toISOString(), now.getTime())).toBe(true)
      }
    }
  })

  it('combines a day and time into an ISO instant', () => {
    expect(customRowToISO('2026-10-05', '18:30')).toContain('2026-10-05')
    expect(customRowToISO('', '18:30')).toBeNull()
    expect(customRowToISO('2026-10-05', '')).toBeNull()
    expect(customRowToISO('bogus', '18:30')).toBeNull()
  })

  it('lists seven midnights starting today', () => {
    const days = nextSevenMidnights(new Date('2026-10-03T12:00:00'))
    expect(days).toHaveLength(7)
    expect(days.every((d) => d.getHours() === 0 && d.getMinutes() === 0)).toBe(true)
    expect(days[1].getTime() - days[0].getTime()).toBe(24 * 3600_000)
  })

  it('formats compact pill dates with fixed order', () => {
    const d = new Date(2026, 9, 3, 19, 0, 0)
    expect(formatPillDate(d, false)).toBe('Sat 3 Oct')
    expect(formatPillDate(d, true)).toBe('Sat 3 Oct 2026')
  })

  it('formats confirmed slots with a full weekday, dot, and no "at"', () => {
    expect(formatSlotDot('2026-10-04T19:00:00.000Z')).not.toContain(' at ')
    expect(formatSlotDot('2026-10-04T19:00:00.000Z')).toContain('·')
  })

  it('formats results slots with a middle dot and no "at"', () => {
    expect(formatSlotShortDot('2026-10-11T19:00:00.000Z')).not.toContain(' at ')
    expect(formatSlotShortDot('2026-10-11T19:00:00.000Z')).toContain('·')
  })

  it('formats compact 24-hour slots for dense lists', () => {
    const iso = new Date(2026, 9, 3, 22, 49, 0).toISOString()
    expect(formatSlotCompact24(iso)).toBe('Sat 3 Oct · 22:49')
    expect(formatSlotCompact24('bogus')).toBe('')
  })

  it('labels the slot weekday per member zone, across midnight', () => {
    expect(formatSlotDay('2026-10-04T01:00:00.000Z', 'America/New_York')).toBe('Sat')
    expect(formatSlotDay('2026-10-04T01:00:00.000Z', 'Asia/Kolkata')).toBe('Sun')
    expect(formatSlotDay('2026-10-04T01:00:00.000Z', null)).toBeNull()
    expect(formatSlotDay('bogus', 'Asia/Kolkata')).toBeNull()
  })

  it('sorts slot previews earliest local time first, zoneless last', () => {
    const iso = '2026-10-04T01:00:00.000Z'
    const members = [
      { id: 'k', display_name: 'Kenji', avatar_url: null, timezone: 'Asia/Tokyo' },
      { id: 'd', display_name: 'Diya', avatar_url: null, timezone: 'Asia/Kolkata' },
      { id: 'z', display_name: 'Zed', avatar_url: null, timezone: null },
      { id: 'j', display_name: 'Javier', avatar_url: null, timezone: 'America/New_York' },
    ]
    const previews = previewSlotMembers(members, iso)
    expect(previews.map((p) => p.id)).toEqual(['j', 'd', 'k', 'z'])
    expect(previews[0].day).toBe('Sat')
    expect(previews[1].day).toBe('Sun')
    expect(previews[0].time).not.toBeNull()
    expect(previews[3].time).toBeNull()
  })

  it('breaks preview ties by display name', () => {
    const iso = '2026-10-04T01:00:00.000Z'
    const members = [
      { id: 'b', display_name: 'Bo', avatar_url: null, timezone: 'UTC' },
      { id: 'a', display_name: 'Ally', avatar_url: null, timezone: 'UTC' },
    ]
    expect(previewSlotMembers(members, iso).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('pluralizes counts with the singular only at exactly 1', () => {
    expect(pluralize(0, 'member', 'members')).toBe('0 members')
    expect(pluralize(1, 'member', 'members')).toBe('1 member')
    expect(pluralize(5, 'member', 'members')).toBe('5 members')
    expect(pluralize(1, 'member joining.', 'members joining.')).toBe('1 member joining.')
  })

  it('formats a slot for a member timezone or nulls without one', () => {
    const rendered = formatSlotForMember('2026-10-03T19:00:00.000Z', 'Europe/Lisbon')
    expect(rendered).not.toBeNull()
    expect(rendered?.time.length).toBeGreaterThan(0)
    expect(formatSlotForMember('2026-10-03T19:00:00.000Z', null)).toBeNull()
    expect(formatSlotForMember('2026-10-03T19:00:00.000Z', 'Bogus/Zone')).toBeNull()
    expect(formatSlotForMember('bogus', 'Europe/Lisbon')).toBeNull()
  })

  it('keeps the propose banner quiet for a week after completion', () => {
    const now = Date.now()
    const twoDaysAgo = new Date(now - 2 * 24 * 3600_000).toISOString()
    const eightDaysAgo = new Date(now - 8 * 24 * 3600_000).toISOString()
    expect(metThisWeek(twoDaysAgo, twoDaysAgo, now)).toBe(true)
    expect(metThisWeek(eightDaysAgo, eightDaysAgo, now)).toBe(false)
    expect(metThisWeek(null, twoDaysAgo, now)).toBe(true)
    expect(metThisWeek(null, null, now)).toBe(false)
    expect(metThisWeek('bogus', twoDaysAgo, now)).toBe(false)
  })
})

describe('meetup push routing', () => {
  it('routes meetup pushes to the meetups screen', () => {
    expect(
      pushDataToHref({ kind: 'meetup_confirmed', clusterId: '11111111-1111-4111-8111-111111111111' }),
    ).toEqual({
      pathname: '/cluster/[clusterId]/meetups',
      params: { clusterId: '11111111-1111-4111-8111-111111111111' },
    })
  })

  it('maps the web meetups deep link to the native route', () => {
    expect(appPathToHref('/cluster/c1/meetups')).toEqual({
      pathname: '/cluster/[clusterId]/meetups',
      params: { clusterId: 'c1' },
    })
  })
})

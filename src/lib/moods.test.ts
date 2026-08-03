import { describe, expect, it } from 'vitest'
import { AVAILABILITY, MOODS, availabilityMeta, moodMeta } from './moods'

describe('moods', () => {
  it('mirrors the mood enum with emoji + labels', () => {
    expect(MOODS.map((m) => m.value)).toEqual(['great', 'good', 'okay', 'low', 'stressed'])
    expect(moodMeta('great').emoji).toBe('😀')
    expect(moodMeta('stressed').label).toBe('Stressed')
  })

  it('falls back gracefully for an unknown mood', () => {
    const meta = moodMeta('calm' as never)
    expect(meta.emoji).toBe('😐')
    expect(meta.label).toBe('calm')
  })

  it('defines the three availability states', () => {
    expect(AVAILABILITY.map((a) => a.value)).toEqual(['available', 'busy', 'dnd'])
    expect(availabilityMeta('dnd').label).toBe('Do not disturb')
  })

  it('falls back for an unknown availability', () => {
    expect(availabilityMeta('gaming' as never).label).toBe('gaming')
  })
})
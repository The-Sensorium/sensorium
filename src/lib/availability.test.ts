import { describe, expect, it } from 'vitest'
import { AVAILABILITY, availabilityMeta } from './availability'

describe('availability', () => {
  it('defines the three availability states', () => {
    expect(AVAILABILITY.map((a) => a.value)).toEqual(['available', 'busy', 'dnd'])
    expect(availabilityMeta('dnd').label).toBe('Do not disturb')
  })

  it('falls back for an unknown availability', () => {
    expect(availabilityMeta('gaming' as never).label).toBe('gaming')
  })
})

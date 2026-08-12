import { describe, expect, it } from 'vitest'
import { notSeenByMembers, seenByMembers } from './seen-by'

const message = { created_at: '2026-01-01T10:00:00Z', author_id: 'a1' }

const reads = [
  { id: 'u4', display_name: 'De', avatar_url: 'avatar.png', read_at: '2026-01-01T10:00:00Z' },
  { id: 'u2', display_name: 'Bo', avatar_url: null, read_at: '2026-01-01T11:00:00Z' },
  { id: 'a1', display_name: 'Author', avatar_url: null, read_at: '2026-01-01T12:00:00Z' },
] as const

const members = [
  { id: 'a1', display_name: 'Author', avatar_url: null },
  { id: 'u2', display_name: 'Bo', avatar_url: null },
  { id: 'u3', display_name: 'Cy', avatar_url: null },
  { id: 'u4', display_name: 'De', avatar_url: 'avatar.png' },
] as const

const readIds = new Set(reads.map((r) => r.id))

describe('seenByMembers', () => {
  it('returns the readers as seen members', () => {
    const seen = seenByMembers(reads, 'a1')
    expect(seen.map((m) => m.id)).toEqual(['u2', 'u4'])
  })

  it('carries the avatar through for rendering', () => {
    expect(seenByMembers(reads, 'a1').find((m) => m.id === 'u4')?.avatar_url).toBe('avatar.png')
  })

  it('carries the immutable per-message read time through', () => {
    expect(seenByMembers(reads, 'a1').find((m) => m.id === 'u2')?.read_at).toBe('2026-01-01T11:00:00Z')
  })

  it('sorts by most recent read time first, regardless of input order', () => {
    const unordered = [reads[1], reads[0]]
    expect(seenByMembers(unordered, 'a1').map((m) => m.id)).toEqual(['u2', 'u4'])
  })

  it('excludes the author even if they have a read row', () => {
    expect(seenByMembers(reads, 'a1').some((m) => m.id === 'a1')).toBe(false)
  })
})

describe('notSeenByMembers', () => {
  it('lists active members who have not read the message, excluding the author', () => {
    expect(notSeenByMembers(message, members, readIds).map((m) => m.id)).toEqual(['u3'])
  })

  it('does not list members who have read it', () => {
    expect(notSeenByMembers(message, members, readIds).some((m) => m.id === 'u2')).toBe(false)
  })

  it('excludes the author', () => {
    expect(notSeenByMembers(message, members, readIds).some((m) => m.id === 'a1')).toBe(false)
  })

  it('lists everyone but the author when no one has read it', () => {
    expect(notSeenByMembers(message, members, new Set()).map((m) => m.id)).toEqual(['u2', 'u3', 'u4'])
  })

  it('has no read time for members who have not seen it', () => {
    expect(notSeenByMembers(message, members, readIds).every((m) => m.read_at === null)).toBe(true)
  })
})

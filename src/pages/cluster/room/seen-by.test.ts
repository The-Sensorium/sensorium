import { describe, expect, it } from 'vitest'
import { notSeenByMembers, seenByMembers } from './seen-by'

const message = { created_at: '2026-01-01T10:00:00Z', author_id: 'a1' }

const members = [
  { id: 'a1', display_name: 'Author', avatar_url: null, last_read_message_at: '2026-01-02T00:00:00Z' },
  { id: 'u2', display_name: 'Bo', avatar_url: null, last_read_message_at: '2026-01-01T11:00:00Z' },
  { id: 'u3', display_name: 'Cy', avatar_url: null, last_read_message_at: '2026-01-01T09:00:00Z' },
  { id: 'u4', display_name: 'De', avatar_url: 'avatar.png', last_read_message_at: '2026-01-01T10:00:00Z' },
] as const

describe('seenByMembers', () => {
  it('includes members whose watermark passed the message, excluding the author', () => {
    const seen = seenByMembers(message, members)
    expect(seen.map((m) => m.id)).toEqual(['u2', 'u4'])
  })

  it('excludes the author even when their watermark is past the message', () => {
    expect(seenByMembers(message, members).some((m) => m.id === 'a1')).toBe(false)
  })

  it('excludes members below the watermark', () => {
    expect(seenByMembers(message, members).some((m) => m.id === 'u3')).toBe(false)
  })

  it('treats an exact created_at match as seen (join-after semantics)', () => {
    expect(seenByMembers(message, members).some((m) => m.id === 'u4')).toBe(true)
  })

  it('carries the avatar through for rendering', () => {
    expect(seenByMembers(message, members).find((m) => m.id === 'u4')?.avatar_url).toBe('avatar.png')
  })
})

describe('notSeenByMembers', () => {
  it('lists members below the watermark, excluding the author', () => {
    expect(notSeenByMembers(message, members).map((m) => m.id)).toEqual(['u3'])
  })

  it('does not list members who have caught up', () => {
    expect(notSeenByMembers(message, members).some((m) => m.id === 'u2')).toBe(false)
  })

  it('excludes the author', () => {
    expect(notSeenByMembers(message, members).some((m) => m.id === 'a1')).toBe(false)
  })
})

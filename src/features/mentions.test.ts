import { describe, expect, it } from 'vitest'
import {
  filterMentionCandidates,
  parseMentionQuery,
  parseMentions,
  type MentionMember,
} from './mentions'

const members: MentionMember[] = [
  { id: 'u1', display_name: 'Diya Mendez' },
  { id: 'u2', display_name: 'Briana Mention' },
  { id: 'u3', display_name: 'Casey' },
]

describe('parseMentions', () => {
  it('returns a single text part for content without mentions', () => {
    expect(parseMentions('hello world', members)).toEqual([{ type: 'text', value: 'hello world' }])
  })

  it('highlights a full display name mention case-insensitively', () => {
    expect(parseMentions('Hey @diya mendez!', members)).toEqual([
      { type: 'text', value: 'Hey' },
      { type: 'mention', prefix: ' ', name: 'diya mendez', id: 'u1' },
      { type: 'text', value: '!' },
    ])
  })

  it('keeps the word-boundary character as plain text before the chip', () => {
    expect(parseMentions('say (@Briana Mention) now', members)).toEqual([
      { type: 'text', value: 'say ' },
      { type: 'mention', prefix: '(', name: 'Briana Mention', id: 'u2' },
      { type: 'text', value: ') now' },
    ])
  })

  it('does not match mid-word @', () => {
    expect(parseMentions('email me@Casey now', members)).toEqual([
      { type: 'text', value: 'email me@Casey now' },
    ])
  })

  it('does not match a name that continues into another word', () => {
    expect(parseMentions('@Caseywood is not Casey', members)).toEqual([
      { type: 'text', value: '@Caseywood is not Casey' },
    ])
  })

  it('does not match a shorter prefix of a longer name', () => {
    expect(parseMentions('@Diya is shorthand?', members)).toEqual([
      { type: 'text', value: '@Diya is shorthand?' },
    ])
  })

  it('matches a name at the very start and end of content', () => {
    expect(parseMentions('@Casey', members)).toEqual([
      { type: 'mention', prefix: '', name: 'Casey', id: 'u3' },
    ])
    expect(parseMentions('x@Casey', members)).toEqual([
      { type: 'text', value: 'x@Casey' },
    ])
  })

  it('handles multiple mentions in one message', () => {
    const parts = parseMentions('@Diya Mendez and @Casey hi', members)
    expect(parts.filter((p) => p.type === 'mention')).toHaveLength(2)
  })

  it('returns text only when there are no members', () => {
    expect(parseMentions('@Diya Mendez', [])).toEqual([{ type: 'text', value: '@Diya Mendez' }])
  })
})

describe('parseMentionQuery', () => {
  it('returns the query after a bare @ at a boundary', () => {
    expect(parseMentionQuery('hi @di', 6)).toEqual({ start: 3, end: 6, query: 'di' })
  })

  it('returns an empty query for a bare @', () => {
    expect(parseMentionQuery('hi @', 4)).toEqual({ start: 3, end: 4, query: '' })
  })

  it('returns null when the caret is before the @', () => {
    expect(parseMentionQuery('hi @di', 3)).toBeNull()
  })

  it('returns null when the token already contains whitespace', () => {
    expect(parseMentionQuery('hi @di men', 9)).toBeNull()
  })

  it('ignores mid-word @', () => {
    expect(parseMentionQuery('email me@di', 11)).toBeNull()
  })

  it('uses the last boundary @ before the caret', () => {
    expect(parseMentionQuery('@casey and @di', 15)).toEqual({ start: 11, end: 15, query: 'di' })
  })

  it('returns null without looping when a leading @ token contains whitespace', () => {
    expect(parseMentionQuery('@Rio Mendez', 12)).toBeNull()
    expect(parseMentionQuery('@di men @Rio Mendez more', 24)).toBeNull()
  })

  it('returns an empty query for a lone @ without looping', () => {
    expect(parseMentionQuery('@', 1)).toEqual({ start: 0, end: 1, query: '' })
  })
})

describe('filterMentionCandidates', () => {
  it('excludes the caller and matches case-insensitively', () => {
    const result = filterMentionCandidates('di', members, 'u1')
    expect(result.map((m) => m.id)).toEqual([])
    const all = filterMentionCandidates('', members, 'u0')
    expect(all).toHaveLength(3)
  })

  it('puts prefix matches before substring matches', () => {
    const result = filterMentionCandidates(
      'al',
      [
        { id: 'b', display_name: 'Mala' },
        { id: 'a', display_name: 'Alma' },
      ],
      'u0',
    )
    expect(result.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('limits results', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, display_name: `Person ${i}` }))
    expect(filterMentionCandidates('', many, 'u0')).toHaveLength(8)
  })
})

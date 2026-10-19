import { describe, expect, it } from 'vitest'
import { visiblePostCount } from './progressive-feed'

const ids = ['a', 'b', 'c']

describe('visiblePostCount', () => {
  it('shows nothing for an empty feed', () => {
    expect(visiblePostCount([], new Set())).toBe(0)
  })

  it('mounts only the newest card until it is ready', () => {
    expect(visiblePostCount(ids, new Set())).toBe(1)
  })

  it('mounts the next card once the previous one is ready', () => {
    expect(visiblePostCount(ids, new Set(['a']))).toBe(2)
    expect(visiblePostCount(ids, new Set(['a', 'b']))).toBe(3)
  })

  it('never mounts past the end of the feed', () => {
    expect(visiblePostCount(ids, new Set(ids))).toBe(3)
  })

  it('stops at the first gap so later cards wait their turn', () => {
    expect(visiblePostCount(ids, new Set(['a', 'c']))).toBe(2)
  })

  it('ignores ready cards from a previous feed', () => {
    expect(visiblePostCount(ids, new Set(['old-1', 'old-2']))).toBe(1)
  })
})

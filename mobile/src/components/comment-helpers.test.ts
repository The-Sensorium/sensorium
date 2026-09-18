import { describe, expect, it } from 'vitest'
import { resolveParentCommentId } from './comment-helpers'

const comments = [{ id: 'a' }, { id: 'b' }]

describe('resolveParentCommentId', () => {
  it('returns the reply target when it still exists', () => {
    expect(resolveParentCommentId(comments, { id: 'b' })).toBe('b')
  })

  it('falls back to top-level when there is no reply target', () => {
    expect(resolveParentCommentId(comments, null)).toBeUndefined()
  })

  it('falls back to top-level when the target was deleted', () => {
    expect(resolveParentCommentId(comments, { id: 'gone' })).toBeUndefined()
  })
})

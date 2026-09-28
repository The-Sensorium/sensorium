import { describe, expect, it } from 'vitest'
import { isCreatedCluster, isPendingCreated } from './created-clusters'

describe('created cluster helpers', () => {
  it('detects created clusters by origin', () => {
    expect(isCreatedCluster({ origin: 'created' })).toBe(true)
    expect(isCreatedCluster({ origin: 'queue' })).toBe(false)
  })

  it('treats created clusters under 3 members as pending', () => {
    expect(isPendingCreated({ origin: 'created' }, 1)).toBe(true)
    expect(isPendingCreated({ origin: 'created' }, 2)).toBe(true)
    expect(isPendingCreated({ origin: 'created' }, 3)).toBe(false)
    expect(isPendingCreated({ origin: 'created' }, 8)).toBe(false)
  })

  it('never treats queue clusters as pending', () => {
    expect(isPendingCreated({ origin: 'queue' }, 1)).toBe(false)
    expect(isPendingCreated({ origin: 'queue' }, 8)).toBe(false)
  })
})

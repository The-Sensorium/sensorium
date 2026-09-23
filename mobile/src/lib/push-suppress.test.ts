import { describe, expect, it } from 'vitest'
import {
  getSuppressedPushCluster,
  pushClusterId,
  setSuppressedPushCluster,
  shouldSuppressPushBanner,
} from './push-suppress'

describe('shouldSuppressPushBanner', () => {
  it('suppresses a push for the open room', () => {
    expect(shouldSuppressPushBanner({ clusterId: 'c1' }, 'c1')).toBe(true)
  })

  it('keeps pushes for other clusters and clusterless pushes', () => {
    expect(shouldSuppressPushBanner({ clusterId: 'c2' }, 'c1')).toBe(false)
    expect(shouldSuppressPushBanner({}, 'c1')).toBe(false)
    expect(shouldSuppressPushBanner(null, 'c1')).toBe(false)
    expect(shouldSuppressPushBanner({ clusterId: 'c1' }, null)).toBe(false)
  })

  it('ignores malformed cluster ids', () => {
    expect(shouldSuppressPushBanner({ clusterId: '' }, 'c1')).toBe(false)
    expect(shouldSuppressPushBanner({ clusterId: 42 }, 'c1')).toBe(false)
  })
})

describe('pushClusterId', () => {
  it('returns the cluster id when present', () => {
    expect(pushClusterId({ clusterId: 'c1' })).toBe('c1')
  })

  it('returns null for missing or malformed ids', () => {
    expect(pushClusterId({})).toBeNull()
    expect(pushClusterId(null)).toBeNull()
    expect(pushClusterId({ clusterId: '' })).toBeNull()
    expect(pushClusterId({ clusterId: 42 })).toBeNull()
  })
})

describe('suppressed cluster registry', () => {
  it('round-trips through the setter', () => {
    setSuppressedPushCluster('c9')
    expect(getSuppressedPushCluster()).toBe('c9')
    setSuppressedPushCluster(null)
    expect(getSuppressedPushCluster()).toBeNull()
  })
})

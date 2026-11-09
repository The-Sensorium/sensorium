import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => new Map<string, string>())

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(store.get(key) ?? null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
      return Promise.resolve()
    },
  },
}))

import {
  clusterPostsSeenKey,
  getPostsSeenAt,
  markPostsSeen,
  postsSeenKey,
  resolveSeenAt,
} from './posts-seen'

const NOW = new Date('2026-05-01T12:00:00.000Z')
const PAST = '2026-04-30T08:00:00.000Z'

beforeEach(() => {
  store.clear()
})

describe('postsSeenKey', () => {
  it('scopes the watermark to the signed-in user', () => {
    expect(postsSeenKey('u1')).toBe('sensorium:posts-seen:u1')
    expect(postsSeenKey('u1')).not.toBe(postsSeenKey('u2'))
  })
})

describe('clusterPostsSeenKey', () => {
  it('scopes the watermark to the user and cluster', () => {
    expect(clusterPostsSeenKey('u1', 'c1')).toBe('sensorium:posts-seen:u1:c1')
    expect(clusterPostsSeenKey('u1', 'c1')).not.toBe(clusterPostsSeenKey('u1', 'c2'))
    expect(clusterPostsSeenKey('u1', 'c1')).not.toBe(clusterPostsSeenKey('u2', 'c1'))
  })
})

describe('getPostsSeenAt', () => {
  it('starts a new cluster from now on a first run', async () => {
    await expect(getPostsSeenAt('u1', 'c1', NOW)).resolves.toBe(NOW.toISOString())
    expect(store.get(clusterPostsSeenKey('u1', 'c1'))).toBe(NOW.toISOString())
  })

  it('seeds a new cluster from the legacy account-wide watermark', async () => {
    store.set(postsSeenKey('u1'), PAST)
    await expect(getPostsSeenAt('u1', 'c1', NOW)).resolves.toBe(PAST)
    expect(store.get(clusterPostsSeenKey('u1', 'c1'))).toBe(PAST)
  })

  it('prefers the cluster watermark over the legacy one', async () => {
    store.set(postsSeenKey('u1'), PAST)
    store.set(clusterPostsSeenKey('u1', 'c1'), '2026-04-29T10:00:00.000Z')
    await expect(getPostsSeenAt('u1', 'c1', NOW)).resolves.toBe('2026-04-29T10:00:00.000Z')
  })
})

describe('markPostsSeen', () => {
  it('advances one cluster and the legacy fallback', async () => {
    store.set(clusterPostsSeenKey('u1', 'c1'), PAST)
    store.set(postsSeenKey('u1'), PAST)
    await markPostsSeen('u1', 'c1', NOW)
    expect(store.get(clusterPostsSeenKey('u1', 'c1'))).toBe(NOW.toISOString())
    expect(store.get(postsSeenKey('u1'))).toBe(NOW.toISOString())
  })

  it('leaves watermarks for other clusters untouched', async () => {
    store.set(clusterPostsSeenKey('u1', 'c1'), PAST)
    store.set(clusterPostsSeenKey('u1', 'c2'), '2026-04-28T08:00:00.000Z')
    await markPostsSeen('u1', 'c1', NOW)
    expect(store.get(clusterPostsSeenKey('u1', 'c2'))).toBe('2026-04-28T08:00:00.000Z')
  })
})

describe('resolveSeenAt', () => {
  it('uses a valid past watermark', () => {
    expect(resolveSeenAt(PAST, NOW)).toBe(PAST)
  })

  it('falls back to now on a first run', () => {
    expect(resolveSeenAt(null, NOW)).toBe(NOW.toISOString())
  })

  it('falls back to now on a corrupt value', () => {
    expect(resolveSeenAt('not-a-date', NOW)).toBe(NOW.toISOString())
  })

  it('falls back to now when the clock moved backwards', () => {
    expect(resolveSeenAt('2026-05-02T00:00:00.000Z', NOW)).toBe(NOW.toISOString())
  })
})

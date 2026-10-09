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
  CLUSTER_APPEARANCE_IDS,
  clearClusterAppearanceCache,
  clusterAppearanceKey,
  getClusterAppearance,
  isClusterAppearanceId,
  resolveClusterPalette,
  setClusterAppearance,
} from './cluster-appearance'

beforeEach(() => {
  store.clear()
  clearClusterAppearanceCache()
})

describe('cluster-appearance', () => {
  it('exposes exactly the five supported themes', () => {
    expect([...CLUSTER_APPEARANCE_IDS]).toEqual(['default', 'lavender', 'sage', 'ocean', 'rose'])
  })

  it('validates stored appearance ids', () => {
    expect(isClusterAppearanceId('lavender')).toBe(true)
    expect(isClusterAppearanceId('amber')).toBe(false)
    expect(isClusterAppearanceId(null)).toBe(false)
    expect(isClusterAppearanceId('')).toBe(false)
  })

  it('keys preferences by user and cluster', () => {
    expect(clusterAppearanceKey('user-1', 'cluster-a')).toBe('sensorium:cluster-appearance:user-1:cluster-a')
    expect(clusterAppearanceKey('user-1', 'cluster-a')).not.toBe(clusterAppearanceKey('user-1', 'cluster-b'))
    expect(clusterAppearanceKey('user-1', 'cluster-a')).not.toBe(clusterAppearanceKey('user-2', 'cluster-a'))
  })

  it('resolves Default from the existing base tokens so it stays pixel-identical', () => {
    const base = { background: '#fff8f6', surfaceContainer: '#faebe6', chatOutgoing: '#B5573A', primary: '#9d3d1c', surface: '#fff8f6', outlineVariant: '#ddc0b8' }
    expect(resolveClusterPalette('default', 'light', base)).toEqual({
      background: '#fff8f6',
      incoming: '#faebe6',
      sent: '#B5573A',
      accent: '#9d3d1c',
      surface: '#fff8f6',
      composerSurface: '#fff8f6',
      border: '#ddc0b8',
    })
  })

  it('resolves the current-mode palette for non-default themes', () => {
    const base = { background: '#fff8f6', surfaceContainer: '#faebe6', chatOutgoing: '#B5573A', primary: '#9d3d1c', surface: '#fff8f6', outlineVariant: '#ddc0b8' }
    expect(resolveClusterPalette('lavender', 'light', base)).toEqual({
      background: '#FAF8FF',
      incoming: '#EDE7F7',
      sent: '#7656B8',
      accent: '#6D4CA8',
      surface: '#F8F5FD',
      composerSurface: '#FBF9FF',
      border: '#D9CBEA',
    })
    expect(resolveClusterPalette('lavender', 'dark', base)).toEqual({
      background: '#111014',
      incoming: '#252128',
      sent: '#7656D6',
      accent: '#8B72E6',
      surface: '#1C1921',
      composerSurface: '#17141C',
      border: '#3A3348',
    })
    expect(resolveClusterPalette('rose', 'dark', base).accent).toBe('#D87891')
  })

  it('derives member strip and composer surfaces per theme in light mode', () => {
    const base = { background: '#fff8f6', surfaceContainer: '#faebe6', chatOutgoing: '#B5573A', primary: '#9d3d1c', surface: '#fff8f6', outlineVariant: '#ddc0b8' }
    expect(resolveClusterPalette('sage', 'light', base)).toMatchObject({
      background: '#F7FAF7',
      surface: '#EFF4EF',
      composerSurface: '#F3F7F3',
      border: '#C2D4C5',
    })
    expect(resolveClusterPalette('ocean', 'light', base)).toMatchObject({
      background: '#F5FBFB',
      surface: '#ECF5F5',
      composerSurface: '#F0F8F8',
      border: '#BEDBDB',
    })
    expect(resolveClusterPalette('rose', 'light', base)).toMatchObject({
      background: '#FFF8FA',
      surface: '#FAEFF2',
      composerSurface: '#FCF3F5',
      border: '#E1C1CB',
    })
  })

  it('persists per user and cluster and falls back to Default', async () => {
    expect(await getClusterAppearance('user-1', 'cluster-a')).toBe('default')
    await setClusterAppearance('user-1', 'cluster-a', 'sage')
    // Force a real storage round-trip, not the write-through cache.
    clearClusterAppearanceCache()
    expect(await getClusterAppearance('user-1', 'cluster-a')).toBe('sage')
    clearClusterAppearanceCache()
    expect(await getClusterAppearance('user-1', 'cluster-b')).toBe('default')
    expect(await getClusterAppearance('user-2', 'cluster-a')).toBe('default')
    expect(await getClusterAppearance(null, 'cluster-a')).toBe('default')
  })

  it('falls back to Default for corrupt stored values', async () => {
    store.set(clusterAppearanceKey('user-1', 'cluster-a'), 'amber')
    expect(await getClusterAppearance('user-1', 'cluster-a')).toBe('default')
  })
})

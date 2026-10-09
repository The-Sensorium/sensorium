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
    expect([...CLUSTER_APPEARANCE_IDS]).toEqual(['default', 'lavender', 'sage', 'ocean', 'amber'])
  })

  it('validates stored appearance ids', () => {
    expect(isClusterAppearanceId('lavender')).toBe(true)
    expect(isClusterAppearanceId('amber')).toBe(true)
    expect(isClusterAppearanceId('rose')).toBe(false)
    expect(isClusterAppearanceId('gold')).toBe(false)
    expect(isClusterAppearanceId(null)).toBe(false)
    expect(isClusterAppearanceId('')).toBe(false)
  })

  it('keys preferences by user and cluster', () => {
    expect(clusterAppearanceKey('user-1', 'cluster-a')).toBe('sensorium:cluster-appearance:user-1:cluster-a')
    expect(clusterAppearanceKey('user-1', 'cluster-a')).not.toBe(clusterAppearanceKey('user-1', 'cluster-b'))
    expect(clusterAppearanceKey('user-1', 'cluster-a')).not.toBe(clusterAppearanceKey('user-2', 'cluster-a'))
  })

  it('resolves Default from the existing base tokens so it stays pixel-identical', () => {
    const base = { background: '#fff8f6', surfaceContainer: '#faebe6', chatOutgoing: '#B5573A', primary: '#9d3d1c', onPrimary: '#ffffff', surface: '#fff8f6', outlineVariant: '#ddc0b8' }
    expect(resolveClusterPalette('default', 'light', base)).toEqual({
      background: '#fff8f6',
      incoming: '#faebe6',
      sent: '#B5573A',
      accent: '#9d3d1c',
      accentText: '#9d3d1c',
      onAccent: '#ffffff',
      surface: '#fff8f6',
      composerSurface: '#fff8f6',
      border: '#ddc0b8',
    })
  })

  it('keeps Default dark pixel-identical to the base tokens', () => {
    const base = { background: '#181818', surfaceContainer: '#222222', chatOutgoing: '#3568C9', primary: '#3568C9', onPrimary: '#ffffff', surface: '#181818', outlineVariant: '#404040' }
    expect(resolveClusterPalette('default', 'dark', base)).toEqual({
      background: '#181818',
      incoming: '#222222',
      sent: '#3568C9',
      accent: '#3568C9',
      accentText: '#3568C9',
      onAccent: '#ffffff',
      surface: '#181818',
      composerSurface: '#181818',
      border: '#404040',
    })
  })

  it('resolves the current-mode palette for non-default themes', () => {
    const base = { background: '#fff8f6', surfaceContainer: '#faebe6', chatOutgoing: '#B5573A', primary: '#9d3d1c', onPrimary: '#ffffff', surface: '#fff8f6', outlineVariant: '#ddc0b8' }
    expect(resolveClusterPalette('lavender', 'light', base)).toEqual({
      background: '#FAF8FF',
      incoming: '#EDE7F7',
      sent: '#7656B8',
      accent: '#6D4CA8',
      accentText: '#6D4CA8',
      onAccent: '#ffffff',
      surface: '#F8F5FD',
      composerSurface: '#FBF9FF',
      border: '#9378BF',
    })
    expect(resolveClusterPalette('lavender', 'dark', base)).toEqual({
      background: '#111014',
      incoming: '#252128',
      sent: '#7656D6',
      accent: '#9A86F0',
      accentText: '#9A86F0',
      onAccent: '#111014',
      surface: '#1C1921',
      composerSurface: '#17141C',
      border: '#7465AD',
    })
    expect(resolveClusterPalette('amber', 'dark', base).accent).toBe('#F2B84B')
    expect(resolveClusterPalette('amber', 'dark', base).onAccent).toBe('#14100A')
    expect(resolveClusterPalette('amber', 'light', base)).toMatchObject({ sent: '#8A5200', accent: '#8A5200', onAccent: '#ffffff' })
    expect(resolveClusterPalette('amber', 'dark', base)).toMatchObject({ sent: '#9A6206' })
    expect(resolveClusterPalette('ocean', 'light', base)).toMatchObject({ sent: '#2F767B', accent: '#216367', onAccent: '#ffffff' })
    expect(resolveClusterPalette('ocean', 'dark', base)).toMatchObject({ sent: '#2A7B81', onAccent: '#0E1415' })
  })

  it('derives member strip and composer surfaces per theme in light mode', () => {
    const base = { background: '#fff8f6', surfaceContainer: '#faebe6', chatOutgoing: '#B5573A', primary: '#9d3d1c', onPrimary: '#ffffff', surface: '#fff8f6', outlineVariant: '#ddc0b8' }
    expect(resolveClusterPalette('sage', 'light', base)).toMatchObject({
      background: '#F7FAF7',
      surface: '#EFF4EF',
      composerSurface: '#F3F7F3',
      border: '#688B75',
    })
    expect(resolveClusterPalette('ocean', 'light', base)).toMatchObject({
      background: '#F5FBFB',
      surface: '#ECF5F5',
      composerSurface: '#F0F8F8',
      border: '#588D90',
    })
    expect(resolveClusterPalette('amber', 'light', base)).toMatchObject({
      background: '#FFFBF3',
      surface: '#FBF0DE',
      composerSurface: '#F8E8CC',
      border: '#A97A32',
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
    store.set(clusterAppearanceKey('user-1', 'cluster-a'), 'gold')
    expect(await getClusterAppearance('user-1', 'cluster-a')).toBe('default')
  })

  it('carries stored Rose selections forward as Amber', async () => {
    store.set(clusterAppearanceKey('user-1', 'cluster-a'), 'rose')
    expect(await getClusterAppearance('user-1', 'cluster-a')).toBe('amber')
  })
})

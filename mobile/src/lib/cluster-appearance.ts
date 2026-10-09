import AsyncStorage from '@react-native-async-storage/async-storage'

export const CLUSTER_APPEARANCE_IDS = ['default', 'lavender', 'sage', 'ocean', 'amber'] as const

export type ClusterAppearanceId = (typeof CLUSTER_APPEARANCE_IDS)[number]

export interface ClusterPalette {
  background: string
  incoming: string
  sent: string
  accent: string
  accentText: string
  onAccent: string
  surface: string
  composerSurface: string
  border: string
}

export interface ClusterAppearanceMeta {
  id: ClusterAppearanceId
  name: string
  description: string
  light: ClusterPalette
  dark: ClusterPalette
}

export const CLUSTER_APPEARANCES: Record<ClusterAppearanceId, ClusterAppearanceMeta> = {
  default: {
    id: 'default',
    name: 'Default',
    description: 'The standard Sensorium look, with warm terracotta in light mode and blue in dark mode.',
    light: { background: '', incoming: '', sent: '#B5573A', accent: '#9D3D1C', accentText: '', onAccent: '', surface: '', composerSurface: '', border: '' },
    dark: { background: '', incoming: '', sent: '#3568C9', accent: '#3568C9', accentText: '', onAccent: '', surface: '', composerSurface: '', border: '' },
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    description: 'Calm, dreamy, and expressive. A soft and modern look.',
    light: { background: '#FAF8FF', incoming: '#EDE7F7', sent: '#7656B8', accent: '#6D4CA8', accentText: '#6D4CA8', onAccent: '#ffffff', surface: '#F8F5FD', composerSurface: '#FBF9FF', border: '#B6A2D5' },
    dark: { background: '#111014', incoming: '#252128', sent: '#7656D6', accent: '#9A86F0', accentText: '#9A86F0', onAccent: '#111014', surface: '#1C1921', composerSurface: '#17141C', border: '#574C7B' },
  },
  sage: {
    id: 'sage',
    name: 'Sage',
    description: 'Grounded and natural. A peaceful, relaxed atmosphere.',
    light: { background: '#F7FAF7', incoming: '#E1EBE2', sent: '#4F7960', accent: '#38634A', accentText: '#38634A', onAccent: '#ffffff', surface: '#EFF4EF', composerSurface: '#F3F7F3', border: '#95B09D' },
    dark: { background: '#101412', incoming: '#222825', sent: '#477F5E', accent: '#65A978', accentText: '#65A978', onAccent: '#101412', surface: '#191F1B', composerSurface: '#141915', border: '#42624D' },
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Fresh, balanced, and modern. A cool, friendly vibe.',
    light: { background: '#F5FBFB', incoming: '#DDEDED', sent: '#2F767B', accent: '#216367', accentText: '#216367', onAccent: '#ffffff', surface: '#ECF5F5', composerSurface: '#F0F8F8', border: '#8BB4B6' },
    dark: { background: '#0E1415', incoming: '#20282A', sent: '#2A7B81', accent: '#4BB3BA', accentText: '#4BB3BA', onAccent: '#0E1415', surface: '#172022', composerSurface: '#12191B', border: '#366164' },
  },
  amber: {
    id: 'amber',
    name: 'Amber',
    description: 'Warm, golden, and modern. A cozy, honeyed feel.',
    light: { background: '#FFFBF3', incoming: '#F5E7D0', sent: '#8A5200', accent: '#8A5200', accentText: '#8A5200', onAccent: '#ffffff', surface: '#FBF0DE', composerSurface: '#F8E8CC', border: '#C69F61' },
    dark: { background: '#14100A', incoming: '#25211B', sent: '#9A6206', accent: '#F2B84B', accentText: '#F2B84B', onAccent: '#14100A', surface: '#211B12', composerSurface: '#292015', border: '#765826' },
  },
}

export function isClusterAppearanceId(value: unknown): value is ClusterAppearanceId {
  return typeof value === 'string' && (CLUSTER_APPEARANCE_IDS as readonly string[]).includes(value)
}

export function clusterAppearanceKey(userId: string, clusterId: string): string {
  return `sensorium:cluster-appearance:${userId}:${clusterId}`
}

const appearanceCache = new Map<string, ClusterAppearanceId>()

function cacheKey(userId: string, clusterId: string): string {
  return `${userId}:${clusterId}`
}

export function clearClusterAppearanceCache(): void {
  appearanceCache.clear()
}

export function getCachedClusterAppearance(
  userId: string | null,
  clusterId: string | null | undefined,
): ClusterAppearanceId | undefined {
  if (!userId || !clusterId) return undefined
  return appearanceCache.get(cacheKey(userId, clusterId))
}

export async function getClusterAppearance(
  userId: string | null,
  clusterId: string | null | undefined,
): Promise<ClusterAppearanceId> {
  if (!userId || !clusterId) return 'default'
  const key = cacheKey(userId, clusterId)
  const cached = appearanceCache.get(key)
  if (cached) return cached
  try {
    const stored = await AsyncStorage.getItem(clusterAppearanceKey(userId, clusterId))
    // Rose was replaced by Amber: carry existing selections forward.
    if (stored === 'rose') {
      appearanceCache.set(key, 'amber')
      return 'amber'
    }
    if (isClusterAppearanceId(stored)) {
      appearanceCache.set(key, stored)
      return stored
    }
    // Missing keys resolve to a stable Default: the sole writer is
    // setClusterAppearance, which maintains the cache. Corrupt values are
    // deliberately not cached so a later valid write is picked up.
    if (stored === null) appearanceCache.set(key, 'default')
  } catch {
    // Local read is best-effort; fall through to Default.
  }
  return 'default'
}

export async function setClusterAppearance(
  userId: string | null,
  clusterId: string | null | undefined,
  appearance: ClusterAppearanceId,
): Promise<void> {
  if (!userId || !clusterId) return
  await AsyncStorage.setItem(clusterAppearanceKey(userId, clusterId), appearance)
  appearanceCache.set(cacheKey(userId, clusterId), appearance)
}

export interface ClusterBaseTokens {
  background: string
  surfaceContainer: string
  chatOutgoing: string
  primary: string
  onPrimary: string
  surface: string
  outlineVariant: string
}

export function resolveClusterPalette(
  appearance: ClusterAppearanceId,
  scheme: 'light' | 'dark',
  base: ClusterBaseTokens,
): ClusterPalette {
  if (appearance === 'default') {
    return {
      background: base.background,
      incoming: base.surfaceContainer,
      sent: base.chatOutgoing,
      accent: base.primary,
      accentText: base.primary,
      onAccent: base.onPrimary,
      surface: base.surface,
      composerSurface: base.surface,
      border: base.outlineVariant,
    }
  }
  return scheme === 'dark' ? CLUSTER_APPEARANCES[appearance].dark : CLUSTER_APPEARANCES[appearance].light
}

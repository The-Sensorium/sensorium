import { useResolvedScheme } from './theme-choice'
import { useGlobalTheme, useStoredClusterAppearance } from './cluster-theme'
import {
  resolveClusterPalette,
  type ClusterAppearanceId,
  type ClusterPalette,
} from './cluster-appearance'

export function useClusterAppearanceId(clusterId: string | null | undefined): {
  appearanceId: ClusterAppearanceId
  isLoading: boolean
  refresh: () => void
} {
  return useStoredClusterAppearance(clusterId)
}

export function useClusterTheme(clusterId: string | null | undefined): {
  appearanceId: ClusterAppearanceId
  tokens: ClusterPalette
  isLoading: boolean
  refresh: () => void
} {
  const t = useGlobalTheme()
  const scheme = useResolvedScheme()
  const { appearanceId, isLoading, refresh } = useStoredClusterAppearance(clusterId)
  const tokens = resolveClusterPalette(
    appearanceId,
    scheme,
    { background: t.background, surfaceContainer: t.surfaceContainer, chatOutgoing: t.chatOutgoing, primary: t.primary, onPrimary: t.onPrimary, surface: t.surface, outlineVariant: t.outlineVariant },
  )
  return { appearanceId, tokens, isLoading, refresh }
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFocusEffect } from 'expo-router'
import { useAuth } from '../auth-context'
import { colors, darkColors } from './theme-tokens'
import { useResolvedScheme } from './theme-choice'
import { getCachedClusterAppearance, getClusterAppearance, resolveClusterPalette, type ClusterAppearanceId } from './cluster-appearance'

export type ClusterThemeTokens = { [K in keyof typeof colors]: string }

interface ClusterThemeValue {
  theme: ClusterThemeTokens
  appearanceId: ClusterAppearanceId
  composerSurface: string
  onAccent: string
  accentText: string
}

const ClusterThemeContext = createContext<ClusterThemeValue | null>(null)

export function useClusterThemeOverride(): ClusterThemeTokens | null {
  return useContext(ClusterThemeContext)?.theme ?? null
}

export function useProvidedAppearanceId(): ClusterAppearanceId {
  return useContext(ClusterThemeContext)?.appearanceId ?? 'default'
}

export function useClusterComposerSurface(): string | null {
  return useContext(ClusterThemeContext)?.composerSurface ?? null
}

export function useClusterOnAccent(): string | null {
  return useContext(ClusterThemeContext)?.onAccent ?? null
}

export function useClusterAccentText(): string | null {
  return useContext(ClusterThemeContext)?.accentText ?? null
}

export function useGlobalTheme(): ClusterThemeTokens {
  const scheme = useResolvedScheme()
  return scheme === 'dark' ? darkColors : colors
}

export function useStoredClusterAppearance(clusterId: string | null | undefined): {
  appearanceId: ClusterAppearanceId
  isLoading: boolean
  refresh: () => void
} {
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  const [appearanceId, setAppearanceId] = useState<ClusterAppearanceId>(
    () => getCachedClusterAppearance(userId, clusterId) ?? 'default',
  )
  const [isLoading, setIsLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const firstFocus = useRef(true)

  const refresh = useCallback(() => setRevision((r) => r + 1), [])

  useEffect(() => {
    let live = true
    setIsLoading(true)
    getClusterAppearance(userId, clusterId)
      .then((stored) => {
        if (live) {
          setAppearanceId(stored)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (live) {
          setAppearanceId('default')
          setIsLoading(false)
        }
      })
    return () => {
      live = false
    }
  }, [userId, clusterId, revision])

  // useFocusEffect also fires on initial mount, which the effect above
  // already covers. Skip it so each consumer reads once per mount.
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false
        return
      }
      setRevision((r) => r + 1)
    }, []),
  )

  return { appearanceId, isLoading, refresh }
}

export function ClusterThemeProvider({
  clusterId,
  children,
}: {
  clusterId: string | null | undefined
  children: ReactNode
}) {
  const scheme = useResolvedScheme()
  const base: ClusterThemeTokens = scheme === 'dark' ? darkColors : colors
  const { appearanceId } = useStoredClusterAppearance(clusterId)

  const palette = useMemo(
    () =>
      resolveClusterPalette(
        appearanceId,
        scheme,
            { background: base.background, surfaceContainer: base.surfaceContainer, chatOutgoing: base.chatOutgoing, primary: base.primary, onPrimary: base.onPrimary, surface: base.surface, outlineVariant: base.outlineVariant },
      ),
    [appearanceId, base, scheme],
  )

  const theme = useMemo<ClusterThemeTokens>(
    () => ({
      ...base,
      background: palette.background,
      surfaceContainer: palette.incoming,
      chatOutgoing: palette.sent,
      primary: palette.accent,
      surface: palette.surface,
      outlineVariant: palette.border,
    }),
    [palette, base],
  )

  const value = useMemo<ClusterThemeValue>(
    () => ({ theme, appearanceId, composerSurface: palette.composerSurface, onAccent: palette.onAccent, accentText: palette.accentText }),
    [theme, appearanceId, palette],
  )

  return <ClusterThemeContext.Provider value={value}>{children}</ClusterThemeContext.Provider>
}

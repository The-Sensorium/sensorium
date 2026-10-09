import { colors, darkColors } from './theme-tokens'
import { useResolvedScheme } from './theme-choice'
import { useClusterThemeOverride } from './cluster-theme'

export function useTheme() {
  const override = useClusterThemeOverride()
  const scheme = useResolvedScheme()
  if (override) return override
  return scheme === 'dark' ? darkColors : colors
}

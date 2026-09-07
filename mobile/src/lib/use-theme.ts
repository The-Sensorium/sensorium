import { colors, darkColors } from './theme-tokens'
import { useResolvedScheme } from './theme-choice'

export function useTheme() {
  return useResolvedScheme() === 'dark' ? darkColors : colors
}

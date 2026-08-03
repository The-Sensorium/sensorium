import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ThemeContext,
  applyTheme,
  getStoredMode,
  systemPrefersDark,
  type ResolvedTheme,
  type ThemeMode,
} from './theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState(() => getStoredMode())
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark())

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const resolved: ResolvedTheme =
      mode === 'dark' || (mode === 'system' && systemDark) ? 'dark' : 'light'
    applyTheme(resolved)
    try {
      localStorage.setItem('sensorium:theme', mode)
    } catch {
      // ignore storage access errors
    }
  }, [mode, systemDark])

  const setMode = useCallback((next: ThemeMode) => setModeState(next), [])

  const value = useMemo(() => {
    const resolved: ResolvedTheme =
      mode === 'dark' || (mode === 'system' && systemDark) ? 'dark' : 'light'
    return { mode, resolved, setMode }
  }, [mode, systemDark, setMode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

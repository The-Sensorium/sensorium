import { createContext, useContext } from 'react'

export type ThemeMode = 'light' | 'system' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const STORAGE_KEY = 'sensorium:theme'
export const MEDIA = '(prefers-color-scheme: dark)'

export interface ThemeContextValue {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

export function getStoredMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // ignore storage access errors
  }
  return 'light'
}

export function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(MEDIA).matches
  )
}

export function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

export function applyFavicon(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"][data-favicon]')
  for (const link of links) {
    link.media = link.dataset.favicon === resolved ? 'all' : 'not all'
  }
}

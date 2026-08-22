import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  STORAGE_KEY,
  applyTheme,
  getStoredMode,
  systemPrefersDark,
  useTheme,
} from './theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getStoredMode defaults to light', () => {
    expect(getStoredMode()).toBe('light')
  })

  it('getStoredMode returns a valid stored mode', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    expect(getStoredMode()).toBe('dark')
  })

  it('getStoredMode ignores invalid stored values', () => {
    localStorage.setItem(STORAGE_KEY, 'neon')
    expect(getStoredMode()).toBe('light')
  })

  it('getStoredMode tolerates storage access errors', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(getStoredMode()).toBe('light')
    spy.mockRestore()
  })

  it('systemPrefersDark reflects matchMedia', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    })
    expect(systemPrefersDark()).toBe(true)
  })

  it('systemPrefersDark is false in a non-browser environment', () => {
    const origWindow = globalThis.window
    vi.stubGlobal('window', undefined)
    expect(systemPrefersDark()).toBe(false)
    vi.stubGlobal('window', origWindow)
  })

  it('applyTheme toggles the dark class and color-scheme', () => {
    const root = document.documentElement
    applyTheme('dark')
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.style.colorScheme).toBe('dark')

    applyTheme('light')
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.style.colorScheme).toBe('light')
  })

  it('useTheme throws outside a ThemeProvider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be used within a ThemeProvider',
    )
  })
})

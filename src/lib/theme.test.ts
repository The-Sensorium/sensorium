import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  STORAGE_KEY,
  applyFavicon,
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

  it('applyFavicon activates the matching icon set', () => {
    document.head.innerHTML = [
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg" media="(prefers-color-scheme: light)" data-favicon="light">',
      '<link rel="icon" type="image/svg+xml" href="/favicon-dark.svg" media="(prefers-color-scheme: dark)" data-favicon="dark">',
      '<link rel="icon" type="image/x-icon" href="/favicon.ico" media="(prefers-color-scheme: light)" data-favicon="light">',
      '<link rel="icon" type="image/x-icon" href="/favicon-dark.ico" media="(prefers-color-scheme: dark)" data-favicon="dark">',
    ].join('')
    const media = (href: string) =>
      document.querySelector(`link[href="${href}"]`)?.getAttribute('media')

    applyFavicon('dark')
    expect(media('/favicon-dark.svg')).toBe('all')
    expect(media('/favicon-dark.ico')).toBe('all')
    expect(media('/favicon.svg')).toBe('not all')
    expect(media('/favicon.ico')).toBe('not all')

    applyFavicon('light')
    expect(media('/favicon.svg')).toBe('all')
    expect(media('/favicon.ico')).toBe('all')
    expect(media('/favicon-dark.svg')).toBe('not all')

    document.head.innerHTML = ''
  })

  it('applyFavicon is a no-op without a document', () => {
    const doc = globalThis.document
    vi.stubGlobal('document', undefined)
    expect(() => applyFavicon('dark')).not.toThrow()
    vi.stubGlobal('document', doc)
  })

  it('useTheme throws outside a ThemeProvider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be used within a ThemeProvider',
    )
  })
})

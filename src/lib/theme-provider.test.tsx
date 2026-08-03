import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from './theme-provider'
import { useTheme } from './theme'

function Probe() {
  const { mode, resolved, setMode } = useTheme()
  return (
    <button type="button" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}>
      mode={mode} resolved={resolved}
    </button>
  )
}

const listeners = new Set<(e: Event) => void>()

function installMatchMedia(matches: boolean) {
  let current = matches
  listeners.clear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({
      get matches() {
        return current
      },
      addEventListener: (_type: string, cb: (e: Event) => void) => listeners.add(cb),
      removeEventListener: (_type: string, cb: (e: Event) => void) => listeners.delete(cb),
    }),
  })
  return { setMatches: (value: boolean) => { current = value } }
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    installMatchMedia(false)
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
    vi.restoreAllMocks()
  })

  it('applies the stored mode and resolves it on load', () => {
    localStorage.setItem('sensorium:theme', 'dark')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('mode=dark resolved=dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('defaults to system mode when nothing is stored', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('mode=system')
  })

  it('persists a mode change and updates the class', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    await user.click(screen.getByRole('button'))
    expect(localStorage.getItem('sensorium:theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('listens to system preference changes', () => {
    const { setMatches } = installMatchMedia(false)
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('mode=system resolved=light')

    act(() => {
      setMatches(true)
      listeners.forEach((cb) => cb(new Event('change')))
    })
    expect(screen.getByRole('button')).toHaveTextContent('mode=system resolved=dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('leaves the light class when system resolves light', () => {
    localStorage.setItem('sensorium:theme', 'system')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('mode=system resolved=light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

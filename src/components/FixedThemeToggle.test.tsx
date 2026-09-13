import { describe, expect, it } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ThemeContext } from '../lib/theme'
import { FixedThemeToggle } from './FixedThemeToggle'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

function renderToggle() {
  return render(
    <ThemeContext.Provider value={{ mode: 'light', resolved: 'light', setMode: () => undefined }}>
      <FixedThemeToggle />
    </ThemeContext.Provider>,
  )
}

function wrapper() {
  return screen.getByRole('button', { name: 'Change theme' }).closest('div.fixed')
}

describe('FixedThemeToggle', () => {
  it('sits at the top corner when online', () => {
    setOnline(true)
    renderToggle()
    expect(wrapper()?.className).toContain('top-4')
    expect(wrapper()?.className).not.toContain('top-16')
  })

  it('drops below the offline banner when offline', () => {
    setOnline(false)
    renderToggle()
    expect(wrapper()?.className).toContain('top-16')
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(wrapper()?.className).toContain('top-4')
    setOnline(true)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrandMark } from './BrandMark'
import { ThemeContext, type ThemeContextValue } from '../lib/theme'

function renderWithTheme(resolved: ThemeContextValue['resolved']) {
  return render(
    <ThemeContext.Provider value={{ mode: 'system', resolved, setMode: vi.fn() }}>
      <BrandMark />
    </ThemeContext.Provider>,
  )
}

describe('BrandMark', () => {
  it('uses the light logo in light mode', () => {
    const { container } = renderWithTheme('light')
    expect(container.querySelector('img')).toHaveAttribute('src', '/logo-mark.png')
  })

  it('uses the dark logo in dark mode', () => {
    const { container } = renderWithTheme('dark')
    expect(container.querySelector('img')).toHaveAttribute('src', '/logo-mark-dark.png')
  })

  it('is decorative by default but accepts a label', () => {
    const { container } = renderWithTheme('light')
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
    render(
      <ThemeContext.Provider value={{ mode: 'system', resolved: 'light', setMode: vi.fn() }}>
        <BrandMark alt="Sensorium logo" />
      </ThemeContext.Provider>,
    )
    expect(screen.getByRole('img', { name: 'Sensorium logo' })).toBeInTheDocument()
  })

  it('falls back to the system preference outside a provider', () => {
    const { container } = render(<BrandMark />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/logo-mark.png')
  })
})

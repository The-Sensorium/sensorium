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
  it('renders a themeable svg that inherits the primary token', () => {
    const { container } = renderWithTheme('light')
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveStyle({ color: 'var(--color-primary)' })
    expect(container.querySelector('path')).toHaveAttribute('fill', 'currentColor')
  })

  it('renders identically in light and dark mode (the CSS var does the work)', () => {
    const light = renderWithTheme('light')
    const lightHtml = light.container.innerHTML
    light.unmount()
    const dark = renderWithTheme('dark')
    expect(dark.container.innerHTML).toBe(lightHtml)
  })

  it('is decorative by default but accepts a label', () => {
    const { container } = renderWithTheme('light')
    const svg = container.querySelector('svg')
    expect(svg).not.toHaveAttribute('role', 'img')
    render(
      <ThemeContext.Provider value={{ mode: 'system', resolved: 'light', setMode: vi.fn() }}>
        <BrandMark alt="Sensorium logo" />
      </ThemeContext.Provider>,
    )
    expect(screen.getByRole('img', { name: 'Sensorium logo' })).toBeInTheDocument()
  })

  it('renders without a theme provider', () => {
    const { container } = render(<BrandMark />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})

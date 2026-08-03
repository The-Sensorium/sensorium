import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from './theme-toggle'
import { ThemeContext, type ThemeContextValue } from '../lib/theme'

function renderWithTheme(value: ThemeContextValue) {
  return render(
    <ThemeContext.Provider value={value}>
      <ThemeToggle />
    </ThemeContext.Provider>,
  )
}

describe('ThemeToggle', () => {
  const base = {
    mode: 'system' as const,
    resolved: 'light' as const,
    setMode: vi.fn(),
  }

  it('shows a sun icon in light mode', () => {
    renderWithTheme(base)
    const button = screen.getByRole('button', { name: 'Change theme' })
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('opens the menu on click and lists all modes', async () => {
    const user = userEvent.setup()
    renderWithTheme(base)
    await user.click(screen.getByRole('button', { name: 'Change theme' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    for (const label of ['Light', 'System', 'Dark']) {
      expect(screen.getByRole('menuitemradio', { name: label })).toBeInTheDocument()
    }
  })

  it('marks the active mode with aria-checked', async () => {
    const user = userEvent.setup()
    renderWithTheme({ ...base, mode: 'dark' })
    await user.click(screen.getByRole('button', { name: 'Change theme' }))
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('calls setMode and closes the menu on selection', async () => {
    const user = userEvent.setup()
    const setMode = vi.fn()
    renderWithTheme({ ...base, setMode })
    await user.click(screen.getByRole('button', { name: 'Change theme' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Dark' }))
    expect(setMode).toHaveBeenCalledWith('dark')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes the menu on Escape', async () => {
    const user = userEvent.setup()
    renderWithTheme(base)
    await user.click(screen.getByRole('button', { name: 'Change theme' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

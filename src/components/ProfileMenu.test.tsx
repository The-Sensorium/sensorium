import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfileMenu } from './ProfileMenu'
import { ThemeContext } from '../lib/theme'

const hooks = vi.hoisted(() => ({
  useProfile: vi.fn(),
}))

vi.mock('../lib/use-profile', () => ({ useProfile: hooks.useProfile }))

function renderMenu() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ThemeContext.Provider value={{ mode: 'system', resolved: 'light', setMode: vi.fn() }}>
          <ProfileMenu />
        </ThemeContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfileMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useProfile.mockReturnValue({
      data: { display_name: 'Ally', email: 'ally@example.com', avatar_url: null },
    })
  })

  it('opens the account menu with profile, settings, and sign out', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'Account menu for Ally' }))
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit profile' })).toHaveAttribute('href', '/settings/profile')
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('opens the sign-out confirmation from the menu', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'Account menu for Ally' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(screen.getByRole('dialog', { name: 'Sign out?' })).toBeInTheDocument()
  })

  it('closes the menu on Escape', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'Account menu for Ally' }))
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'Account' })).not.toBeInTheDocument()
  })

  it('lists appearance options in the menu', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: 'Account menu for Ally' }))
    for (const label of ['Light', 'System', 'Dark']) {
      expect(screen.getByRole('menuitemradio', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('hides account links in the minimal variant', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <ThemeContext.Provider value={{ mode: 'system', resolved: 'light', setMode: vi.fn() }}>
            <ProfileMenu accountLinks={false} />
          </ThemeContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Account menu for Ally' }))
    expect(screen.queryByRole('menuitem', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeInTheDocument()
  })
})

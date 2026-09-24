import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SwitchRoleButton } from './SwitchRoleButton'

const hooks = vi.hoisted(() => ({
  useMyAccess: vi.fn(),
  useSessionRole: vi.fn(),
  isMobileDevice: vi.fn(),
}))

vi.mock('../features/access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/access')>()
  return { ...actual, useMyAccess: hooks.useMyAccess }
})

vi.mock('../app/session-role-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/session-role-context')>()
  return { ...actual, useSessionRole: hooks.useSessionRole }
})

vi.mock('../lib/device', () => ({ isMobileDevice: hooks.isMobileDevice }))

const adminAccess = {
  isLoading: false,
  isError: false,
  data: {
    user_id: 'u1',
    roles: ['admin'],
    available_session_roles: ['member', 'admin'],
    capabilities: ['can_moderate', 'can_manage_roles'],
    account_status: 'active',
  },
}

function renderButton() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SwitchRoleButton />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SwitchRoleButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useMyAccess.mockReturnValue(adminAccess)
    hooks.useSessionRole.mockReturnValue({ role: 'member', setRole: vi.fn(), clearRole: vi.fn() })
  })

  it('shows the workspace switcher on desktop for staff', () => {
    hooks.isMobileDevice.mockReturnValue(false)
    renderButton()
    expect(screen.getByRole('button', { name: 'Choose workspace' })).toBeVisible()
  })

  it('hides the workspace switcher on mobile even for staff', () => {
    hooks.isMobileDevice.mockReturnValue(true)
    const { container } = renderButton()
    expect(screen.queryByRole('button', { name: 'Choose workspace' })).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })
})

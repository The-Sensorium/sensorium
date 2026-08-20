import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionRoleProvider } from './session-role-provider'
import { useSessionRole } from './session-role-context'

const auth = vi.hoisted(() => ({ state: 'loading' as 'loading' | 'signedIn', userId: 'user-1' }))

vi.mock('./auth-context', () => ({
  useAuth: () => (auth.state === 'loading' ? { state: 'loading' } : { state: 'signedIn', userId: auth.userId }),
}))

vi.mock('../features/access', () => ({
  useMyAccess: () => ({ data: undefined }),
}))

function Consumer() {
  const { role } = useSessionRole()
  return <output>{role ?? 'none'}</output>
}

describe('SessionRoleProvider', () => {
  beforeEach(() => {
    sessionStorage.clear()
    auth.state = 'loading'
    auth.userId = 'user-1'
  })

  it('keeps the selected role across auth bootstrap on reload', async () => {
    sessionStorage.setItem('sensorium.sessionRole', 'admin')
    const view = render(
      <SessionRoleProvider>
        <Consumer />
      </SessionRoleProvider>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('admin')

    auth.state = 'signedIn'
    await act(async () => view.rerender(
      <SessionRoleProvider>
        <Consumer />
      </SessionRoleProvider>,
    ))

    expect(screen.getByRole('status')).toHaveTextContent('admin')
    expect(sessionStorage.getItem('sensorium.sessionRole')).toBe('admin')
  })

  it('clears the selected role when the authenticated user changes', async () => {
    sessionStorage.setItem('sensorium.sessionRole', 'admin')
    const view = render(
      <SessionRoleProvider>
        <Consumer />
      </SessionRoleProvider>,
    )

    auth.state = 'signedIn'
    await act(async () => view.rerender(
      <SessionRoleProvider>
        <Consumer />
      </SessionRoleProvider>,
    ))

    auth.userId = 'user-2'
    await act(async () => view.rerender(
      <SessionRoleProvider>
        <Consumer />
      </SessionRoleProvider>,
    ))

    expect(screen.getByRole('status')).toHaveTextContent('none')
    expect(sessionStorage.getItem('sensorium.sessionRole')).toBeNull()
  })
})

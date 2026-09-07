import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MuteButton } from './MuteButton'
import { useAuth } from '../app/auth-context'
import { useIsMuted, useMuteUser, useUnmuteUser } from '../features/moderation'

vi.mock('../app/auth-context', () => ({ useAuth: vi.fn() }))
vi.mock('../features/moderation', () => ({
  useIsMuted: vi.fn(),
  useMuteUser: vi.fn(),
  useUnmuteUser: vi.fn(),
}))

const useAuthMock = vi.mocked(useAuth)
const useIsMutedMock = vi.mocked(useIsMuted)
const useMuteUserMock = vi.mocked(useMuteUser)
const useUnmuteUserMock = vi.mocked(useUnmuteUser)

describe('MuteButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthMock.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' } as never)
    useIsMutedMock.mockReturnValue(false)
    useMuteUserMock.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null } as never)
    useUnmuteUserMock.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null } as never)
  })

  it('renders nothing for your own user', () => {
    const { container } = render(<MuteButton targetUserId="u1" targetName="Ally" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('mutes on click when not muted', () => {
    const mutate = vi.fn()
    useMuteUserMock.mockReturnValue({ mutate, isPending: false, error: null } as never)
    render(<MuteButton targetUserId="u2" targetName="Bo" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mute Bo' }))
    expect(mutate).toHaveBeenCalledWith({ targetUserId: 'u2', displayName: 'Bo' })
  })

  it('unmutes on click when muted', () => {
    useIsMutedMock.mockReturnValue(true)
    const mutate = vi.fn()
    useUnmuteUserMock.mockReturnValue({ mutate, isPending: false, error: null } as never)
    render(<MuteButton targetUserId="u2" targetName="Bo" />)
    fireEvent.click(screen.getByRole('button', { name: 'Unmute Bo' }))
    expect(mutate).toHaveBeenCalledWith({ targetUserId: 'u2' })
  })

  it('shows an error when the toggle fails', () => {
    useMuteUserMock.mockReturnValue({ mutate: vi.fn(), isPending: false, error: new Error('nope') } as never)
    render(<MuteButton targetUserId="u2" targetName="Bo" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t update. Try again.')
  })
})

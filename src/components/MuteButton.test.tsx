import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
    useMuteUserMock.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false, error: null } as never)
    useUnmuteUserMock.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false, error: null } as never)
  })

  it('renders nothing for your own user', () => {
    const { container } = render(<MuteButton targetUserId="u1" targetName="Ally" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('asks for confirmation before muting, and mutes on confirm', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    useMuteUserMock.mockReturnValue({ mutate: vi.fn(), mutateAsync, isPending: false, error: null } as never)
    render(<MuteButton targetUserId="u2" targetName="Bo" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mute Bo' }))
    expect(screen.getByRole('dialog', { name: 'Mute Bo?' })).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Mute Bo now' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ targetUserId: 'u2', displayName: 'Bo' }))
  })

  it('cancels the mute confirmation without muting', () => {
    const mutateAsync = vi.fn()
    useMuteUserMock.mockReturnValue({ mutate: vi.fn(), mutateAsync, isPending: false, error: null } as never)
    render(<MuteButton targetUserId="u2" targetName="Bo" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mute Bo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mutateAsync).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Mute Bo?' })).not.toBeInTheDocument()
  })

  it('asks for confirmation before unmuting, and unmutes on confirm', async () => {
    useIsMutedMock.mockReturnValue(true)
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    useUnmuteUserMock.mockReturnValue({ mutate: vi.fn(), mutateAsync, isPending: false, error: null } as never)
    render(<MuteButton targetUserId="u2" targetName="Bo" />)
    fireEvent.click(screen.getByRole('button', { name: 'Unmute Bo' }))
    expect(screen.getByRole('dialog', { name: 'Unmute Bo?' })).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Unmute Bo now' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ targetUserId: 'u2' }))
  })

  it('shows an error when the toggle fails', () => {
    useMuteUserMock.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: new Error('nope') } as never)
    render(<MuteButton targetUserId="u2" targetName="Bo" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t update. Try again.')
  })

  it('shows an error in the dialog when confirming fails', async () => {
    useMuteUserMock.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn().mockRejectedValue(new Error('nope')), isPending: false, error: null } as never)
    render(<MuteButton targetUserId="u2" targetName="Bo" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mute Bo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mute Bo now' }))
    const dialog = await screen.findByRole('dialog', { name: 'Mute Bo?' })
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Couldn’t update. Try again.'))
  })

  it('keeps the unmute dialog open without flashing mute while unmuting', async () => {
    useIsMutedMock.mockReturnValue(true)
    let resolveMutate!: (value: unknown) => void
    const mutateAsync = vi.fn(() => new Promise((resolve) => { resolveMutate = resolve }))
    useUnmuteUserMock.mockReturnValue({ mutate: vi.fn(), mutateAsync, isPending: false, error: null } as never)
    const { rerender } = render(<MuteButton targetUserId="u2" targetName="Bo" />)
    fireEvent.click(screen.getByRole('button', { name: 'Unmute Bo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unmute Bo now' }))
    useIsMutedMock.mockReturnValue(false)
    rerender(<MuteButton targetUserId="u2" targetName="Bo" />)
    expect(screen.getByRole('dialog', { name: 'Unmute Bo?' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Mute Bo?' })).not.toBeInTheDocument()
    resolveMutate(undefined)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

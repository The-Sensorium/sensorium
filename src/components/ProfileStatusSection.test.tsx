import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfileStatusSection } from './ProfileStatusSection'

const hooks = vi.hoisted(() => ({
  useProfile: vi.fn(),
  useUpdateProfile: vi.fn(),
}))

vi.mock('../lib/use-profile', () => ({ useProfile: hooks.useProfile }))
vi.mock('../features/cluster', () => ({ useUpdateProfile: hooks.useUpdateProfile }))

const profile = {
  id: 'u1',
  display_name: 'Ally',
  email: 'ally@example.com',
  manual_status: 'online',
  avatar_url: null,
}

const updateProfile = { mutateAsync: vi.fn().mockResolvedValue(undefined), mutate: vi.fn(), isPending: false, isError: false }

function renderSection() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ProfileStatusSection />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfileStatusSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useProfile.mockReturnValue({ data: profile, isLoading: false })
    hooks.useUpdateProfile.mockReturnValue(updateProfile)
  })

  it('shows the current manual status', () => {
    renderSection()
    expect(screen.getByRole('button', { name: 'Online' })).toBeInTheDocument()
  })

  it('opens the status dialog', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Online' }))
    expect(screen.getByRole('dialog', { name: 'Set your status' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Profile status' })).toBeInTheDocument()
  })

  it('saves a newly selected manual status', async () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Online' }))
    fireEvent.click(screen.getByRole('radio', { name: /Away/ }))
    await waitFor(() => expect(updateProfile.mutate).toHaveBeenCalledWith({ manual_status: 'away' }, expect.anything()))
  })

  it('reverts and shows an error when saving the status fails', async () => {
    updateProfile.mutate.mockImplementation((_patch: unknown, opts?: { onError?: (err: unknown) => void; onSettled?: () => void }) => {
      opts?.onError?.(new Error('offline'))
      opts?.onSettled?.()
    })
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Online' }))
    fireEvent.click(screen.getByRole('radio', { name: /Busy/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not save your status'))
    expect(screen.getByRole('button', { name: 'Online' })).toBeInTheDocument()
  })
})

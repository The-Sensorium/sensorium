import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsPage } from './SettingsPage'

const hooks = vi.hoisted(() => ({
  useProfile: vi.fn(),
  useUpdateProfile: vi.fn(),
  useDeleteAccount: vi.fn(),
  useMyClusters: vi.fn(),
  useNotificationPrefs: vi.fn(),
  useUpsertNotificationPrefs: vi.fn(),
  useAvatarUrl: vi.fn(),
  requireSupabase: vi.fn(),
  prepareImage: vi.fn(),
}))

vi.mock('../lib/use-profile', () => ({ useProfile: hooks.useProfile }))
vi.mock('../features/cluster', () => ({ useUpdateProfile: hooks.useUpdateProfile }))
vi.mock('../features/moderation', () => ({ useDeleteAccount: hooks.useDeleteAccount }))
vi.mock('../features/matching', () => ({ useMyClusters: hooks.useMyClusters }))
vi.mock('../features/avatars', () => ({ useAvatarUrl: hooks.useAvatarUrl }))
vi.mock('../lib/supabase', () => ({ requireSupabase: hooks.requireSupabase }))
vi.mock('../lib/image', () => ({ prepareImage: hooks.prepareImage }))
vi.mock('../features/notifications', () => {
  const PREF_TOGGLES = ['messages', 'mentions', 'reactions', 'votes', 'invitations', 'signals']
  const PREF_LABELS = {
    messages: 'Messages',
    mentions: 'Mentions',
    reactions: 'Reactions',
    votes: 'Votes & replacements',
    invitations: 'Invitations',
    signals: 'Signals',
  }
  return {
    PREF_TOGGLES,
    PREF_LABELS,
    useNotificationPrefs: hooks.useNotificationPrefs,
    useUpsertNotificationPrefs: hooks.useUpsertNotificationPrefs,
  }
})

const profile = {
  id: 'u1',
  display_name: 'Ally',
  email: 'ally@example.com',
  bio: 'Hello there',
  current_status: 'busy',
  avatar_url: null,
}

const updateProfile = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false, isError: false }

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useProfile.mockReturnValue({ data: profile, isLoading: false })
    hooks.useUpdateProfile.mockReturnValue(updateProfile)
    hooks.useDeleteAccount.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false })
    hooks.useMyClusters.mockReturnValue({ data: [], isLoading: false, isError: false })
    hooks.useNotificationPrefs.mockReturnValue({ data: [], isLoading: false, isError: false })
    hooks.useUpsertNotificationPrefs.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) })
    hooks.useAvatarUrl.mockReturnValue({ data: undefined })
    hooks.requireSupabase.mockReturnValue({
      auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: { path: 'u1/123.png' }, error: null }),
        }),
      },
    })
  })

  it('renders the profile display name and email', () => {
    renderPage()
    expect(screen.getByText('Ally')).toBeInTheDocument()
    expect(screen.getByText('ally@example.com')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('saves profile edits', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ally Updated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(updateProfile.mutateAsync).toHaveBeenCalledWith({
        display_name: 'Ally Updated',
        bio: 'Hello there',
      }),
    )
  })

  it('saves the status', async () => {
    renderPage()
    const status = screen.getByPlaceholderText('e.g. Deep in a good book')
    fireEvent.change(status, { target: { value: 'In a meeting' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(updateProfile.mutateAsync).toHaveBeenCalledWith({ current_status: 'In a meeting' }))
  })

  it('shows an error banner when saving fails', () => {
    hooks.useUpdateProfile.mockReturnValue({ ...updateProfile, isError: true })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save your changes')
  })

  it('rejects an avatar with an unsupported type', async () => {
    renderPage()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'photo.bmp', { type: 'image/bmp' })] },
    })
    await waitFor(() => expect(screen.getByText('Please choose a JPG, PNG, WebP, or GIF image.')).toBeInTheDocument())
    expect(hooks.requireSupabase().storage.from).not.toHaveBeenCalled()
  })

  it('rejects an avatar larger than 5 MB', async () => {
    renderPage()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const big = new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [big] } })
    await waitFor(() => expect(screen.getByText('That image is larger than 5 MB.')).toBeInTheDocument())
  })

  it('uploads an avatar and saves the new URL', async () => {
    hooks.prepareImage.mockResolvedValue(new File(['x'], 'photo.png', { type: 'image/png' }))
    renderPage()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] },
    })
    await waitFor(() =>
      expect(updateProfile.mutateAsync).toHaveBeenCalledWith({ avatar_url: 'u1/123.png' }),
    )
  })

  it('removes the avatar photo', async () => {
    hooks.useProfile.mockReturnValue({ data: { ...profile, avatar_url: 'u1/a.png' }, isLoading: false })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove photo?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove photo' }))
    await waitFor(() => expect(updateProfile.mutateAsync).toHaveBeenCalledWith({ avatar_url: null }))
  })

  it('signs the user out', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    const dialog = screen.getByRole('dialog', { name: 'Sign out?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(hooks.requireSupabase().auth.signOut).toHaveBeenCalled())
  })

  it('surfaces a sign-out error', async () => {
    hooks.requireSupabase.mockReturnValue({
      auth: { signOut: vi.fn().mockRejectedValue(new Error('nope')) },
      storage: { from: vi.fn() },
    })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    const dialog = screen.getByRole('dialog', { name: 'Sign out?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(screen.getByText('Could not sign out. Please try again.')).toBeInTheDocument())
  })

  it('requires typing DELETE before deleting the account', async () => {
    const deleteAccount = hooks.useDeleteAccount().mutateAsync
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete account' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete my account' })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByPlaceholderText('Type DELETE to confirm'), {
      target: { value: 'DELETE' },
    })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(deleteAccount).toHaveBeenCalled())
  })

  it('toggles notification preferences per cluster', async () => {
    hooks.useMyClusters.mockReturnValue({
      data: [{ cluster: { id: 'c1', name: 'Aurora' }, joinedAt: '', memberCount: 2 }],
      isLoading: false,
      isError: false,
    })
    const upsert = vi.fn().mockResolvedValue({})
    hooks.useUpsertNotificationPrefs.mockReturnValue({ mutateAsync: upsert })
    renderPage()
    expect(screen.getByText('Aurora')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Messages' }))
    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith({
        clusterId: 'c1',
        toggles: expect.objectContaining({ messages: false, mentions: true, reactions: true }),
      }),
    )
  })

  it('shows an empty state when there are no clusters yet', () => {
    renderPage()
    expect(screen.getByText('No clusters yet. Preferences appear here once you join a cluster.')).toBeInTheDocument()
  })
})

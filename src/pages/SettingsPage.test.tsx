import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsPage } from './SettingsPage'

const hooks = vi.hoisted(() => ({
  useProfile: vi.fn(),
  useUpdateProfile: vi.fn(),
  useDeleteAccount: vi.fn(),
  useMyMutes: vi.fn(),
  useUnmuteUser: vi.fn(),
  useMyClusters: vi.fn(),
  useNotificationPrefs: vi.fn(),
  useUpsertNotificationPrefs: vi.fn(),
  useAvatarUrl: vi.fn(),
  deleteAvatarObject: vi.fn(),
  requireSupabase: vi.fn(),
  prepareImage: vi.fn(),
}))

vi.mock('../lib/use-profile', () => ({ useProfile: hooks.useProfile }))
vi.mock('../features/cluster', () => ({ useUpdateProfile: hooks.useUpdateProfile }))
vi.mock('../features/moderation', () => ({ useDeleteAccount: hooks.useDeleteAccount, useMyMutes: hooks.useMyMutes, useUnmuteUser: hooks.useUnmuteUser }))
vi.mock('../features/matching', () => ({ useMyClusters: hooks.useMyClusters }))
vi.mock('../features/avatars', () => ({ useAvatarUrl: hooks.useAvatarUrl, deleteAvatarObject: hooks.deleteAvatarObject }))
vi.mock('../lib/supabase', () => ({ requireSupabase: hooks.requireSupabase }))
vi.mock('../lib/image', () => ({ AVATAR_MAX_DIMENSION: 256, prepareImage: hooks.prepareImage }))
vi.mock('../components/MuteButton', () => ({ MuteButton: () => <button type="button">Unmute</button> }))
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
  pronouns: 'she/her',
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
    hooks.useMyMutes.mockReturnValue({ data: [], isLoading: false, isError: false })
    hooks.useUnmuteUser.mockReturnValue({ mutate: vi.fn(), isPending: false })
    hooks.useMyClusters.mockReturnValue({ data: [], isLoading: false, isError: false })
    hooks.useNotificationPrefs.mockReturnValue({ data: [], isLoading: false, isError: false })
    hooks.useUpsertNotificationPrefs.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) })
    hooks.useAvatarUrl.mockReturnValue({ data: undefined })
    hooks.deleteAvatarObject.mockResolvedValue(undefined)
    hooks.requireSupabase.mockReturnValue({
      auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: { path: 'u1/123.png' }, error: null }),
        }),
      },
    })
  })

  it('links to the edit profile page', () => {
    renderPage()
    expect(screen.getByText('Ally')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/settings/profile')
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('saves the timezone', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Europe/Lisbon' } })
    fireEvent.click(within(screen.getByRole('region', { name: 'Local time' })).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateProfile.mutateAsync).toHaveBeenCalledWith({ timezone: 'Europe/Lisbon' }))
  })

  it('picks up the saved timezone once the profile loads', () => {
    hooks.useProfile.mockReturnValue({ data: undefined, isLoading: true })
    const page = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    hooks.useProfile.mockReturnValue({ data: { ...profile, timezone: 'Europe/Lisbon' }, isLoading: false })
    page.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByLabelText('Timezone')).toHaveValue('Europe/Lisbon')
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

  it('collapses notification preferences when there are multiple clusters', async () => {
    hooks.useMyClusters.mockReturnValue({
      data: [
        { cluster: { id: 'c1', name: 'Aurora' }, joinedAt: '', memberCount: 2 },
        { cluster: { id: 'c2', name: 'Borealis' }, joinedAt: '', memberCount: 3 },
      ],
      isLoading: false,
      isError: false,
    })
    const upsert = vi.fn().mockResolvedValue({})
    hooks.useUpsertNotificationPrefs.mockReturnValue({ mutateAsync: upsert })
    renderPage()
    const aurora = screen.getByRole('button', { name: /Aurora/ })
    expect(aurora).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /Borealis/ })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(aurora)
    expect(aurora).toHaveAttribute('aria-expanded', 'true')
    const region = document.getElementById('notif-prefs-c1') as HTMLElement
    fireEvent.click(within(region).getByRole('switch', { name: 'Messages' }))
    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith({
        clusterId: 'c1',
        toggles: expect.objectContaining({ messages: false, mentions: true }),
      }),
    )
  })

  it('shows an empty state when there are no clusters yet', () => {
    renderPage()
    expect(screen.getByText('No clusters yet. Preferences appear here once you join a cluster.')).toBeInTheDocument()
  })

  it('lists muted members by name in the Safety section', () => {
    hooks.useMyMutes.mockReturnValue({
      data: [{ muted_user_id: 'u2', display_name: 'Bo', avatar_url: null }],
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByText('Bo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument()
  })

  it('shows an error when muted members fail to load', () => {
    hooks.useMyMutes.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPage()
    expect(screen.getByText('Couldn’t load your muted members. Please try again.')).toBeInTheDocument()
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditProfilePage } from './EditProfilePage'

const hooks = vi.hoisted(() => ({
  useProfile: vi.fn(),
  useUpdateProfile: vi.fn(),
  useAvatarUrl: vi.fn(),
  deleteAvatarObject: vi.fn(),
  requireSupabase: vi.fn(),
  prepareImage: vi.fn(),
}))

vi.mock('../../lib/use-profile', () => ({ useProfile: hooks.useProfile }))
vi.mock('../../features/cluster', () => ({ useUpdateProfile: hooks.useUpdateProfile }))
vi.mock('../../features/avatars', () => ({ useAvatarUrl: hooks.useAvatarUrl, deleteAvatarObject: hooks.deleteAvatarObject }))
vi.mock('../../lib/supabase', () => ({ requireSupabase: hooks.requireSupabase }))
vi.mock('../../lib/image', () => ({ AVATAR_MAX_DIMENSION: 256, prepareImage: hooks.prepareImage }))

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
        <EditProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EditProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.useProfile.mockReturnValue({ data: profile, isLoading: false })
    hooks.useUpdateProfile.mockReturnValue(updateProfile)
    hooks.useAvatarUrl.mockReturnValue({ data: undefined })
    hooks.deleteAvatarObject.mockResolvedValue(undefined)
    hooks.requireSupabase.mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: { path: 'u1/123.png' }, error: null }),
        }),
      },
    })
  })

  it('renders the profile display name and email with a back button', () => {
    renderPage()
    expect(screen.getByText('Ally')).toBeInTheDocument()
    expect(screen.getByText('ally@example.com')).toBeInTheDocument()
    expect(screen.getByText('Edit profile')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
  })

  it('falls back to settings when loaded directly', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/settings/profile']}>
          <Routes>
            <Route path="/settings" element={<p>Settings page</p>} />
            <Route path="/settings/profile" element={<EditProfilePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Settings page')).toBeInTheDocument()
  })

  it('returns to the member profile when navigated from there', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/profile/u1', '/settings/profile']} initialIndex={1}>
          <Routes>
            <Route path="/profile/:userId" element={<p>Member profile</p>} />
            <Route path="/settings/profile" element={<EditProfilePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Member profile')).toBeInTheDocument()
  })

  it('saves profile edits', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ally Updated' } })
    fireEvent.click(within(screen.getByRole('region', { name: 'Profile' })).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(updateProfile.mutateAsync).toHaveBeenCalledWith({
        display_name: 'Ally Updated',
        bio: 'Hello there',
        pronouns: 'she/her',
      }),
    )
  })

  it('saves pronouns', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Pronouns'), { target: { value: 'they/them' } })
    fireEvent.click(within(screen.getByRole('region', { name: 'Profile' })).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(updateProfile.mutateAsync).toHaveBeenCalledWith({
        display_name: 'Ally',
        bio: 'Hello there',
        pronouns: 'they/them',
      }),
    )
  })

  it('saves custom pronouns from the free-text option', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Pronouns'), { target: { value: '__custom__' } })
    fireEvent.change(screen.getByLabelText('Custom pronouns'), { target: { value: 'ze/zir' } })
    fireEvent.click(within(screen.getByRole('region', { name: 'Profile' })).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(updateProfile.mutateAsync).toHaveBeenCalledWith({
        display_name: 'Ally',
        bio: 'Hello there',
        pronouns: 'ze/zir',
      }),
    )
  })

  it('clears pronouns when set to "Don’t share"', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Pronouns'), { target: { value: '' } })
    fireEvent.click(within(screen.getByRole('region', { name: 'Profile' })).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(updateProfile.mutateAsync).toHaveBeenCalledWith({
        display_name: 'Ally',
        bio: 'Hello there',
        pronouns: null,
      }),
    )
  })

  it('saves the status', async () => {
    renderPage()
    const status = screen.getByPlaceholderText('e.g. Deep in a good book')
    fireEvent.change(status, { target: { value: 'In a meeting' } })
    fireEvent.click(within(screen.getByRole('region', { name: 'Status' })).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(updateProfile.mutateAsync).toHaveBeenCalledWith({ current_status: 'In a meeting' }))
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
          <EditProfilePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    hooks.useProfile.mockReturnValue({ data: { ...profile, timezone: 'Europe/Lisbon' }, isLoading: false })
    page.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <EditProfilePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByLabelText('Timezone')).toHaveValue('Europe/Lisbon')
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
})

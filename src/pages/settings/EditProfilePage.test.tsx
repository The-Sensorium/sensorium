import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditProfilePage } from './EditProfilePage'

const hooks = vi.hoisted(() => ({
  useProfile: vi.fn(),
  useUpdateProfile: vi.fn(),
  useAvatarUrl: vi.fn(),
  deleteAvatarObjects: vi.fn(),
  uploadAvatarPair: vi.fn(),
  validateAvatarFile: vi.fn(),
  prepareAvatarVariants: vi.fn(),
}))

vi.mock('../../lib/use-profile', () => ({ useProfile: hooks.useProfile }))
vi.mock('../../features/cluster', () => ({ useUpdateProfile: hooks.useUpdateProfile }))
vi.mock('../../features/avatars', () => ({
  useAvatarUrl: hooks.useAvatarUrl,
  useAvatarThumbUrl: hooks.useAvatarUrl,
  useAvatarFullUrl: hooks.useAvatarUrl,
  avatarThumbFor: (s: string | null | undefined) => s ?? null,
  avatarFullFor: (s: string | null | undefined) => s ?? null,
  deleteAvatarObject: hooks.deleteAvatarObjects,
  deleteAvatarObjects: hooks.deleteAvatarObjects,
  uploadAvatarPair: hooks.uploadAvatarPair,
}))
vi.mock('../../lib/image', () => ({
  validateAvatarFile: hooks.validateAvatarFile,
  prepareAvatarVariants: hooks.prepareAvatarVariants,
}))

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
    hooks.deleteAvatarObjects.mockResolvedValue(undefined)
    hooks.validateAvatarFile.mockReturnValue(null)
    hooks.uploadAvatarPair.mockResolvedValue({ fullPath: 'u1/id_full.webp', thumbPath: 'u1/id_thumb.webp' })
    hooks.prepareAvatarVariants.mockImplementation(async (file: File) => ({ full: file, thumb: file }))
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
    fireEvent.click(within(screen.getByRole('region', { name: 'Status message' })).getByRole('button', { name: 'Save changes' }))
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
    hooks.validateAvatarFile.mockReturnValue('Please choose a JPG, PNG, WebP, or GIF image.')
    renderPage()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'photo.bmp', { type: 'image/bmp' })] },
    })
    await waitFor(() => expect(screen.getByText('Please choose a JPG, PNG, WebP, or GIF image.')).toBeInTheDocument())
    expect(hooks.uploadAvatarPair).not.toHaveBeenCalled()
  })

  it('rejects an avatar larger than 5 MB', async () => {
    hooks.validateAvatarFile.mockReturnValue('That image is larger than 5 MB.')
    renderPage()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const big = new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [big] } })
    await waitFor(() => expect(screen.getByText('That image is larger than 5 MB.')).toBeInTheDocument())
    expect(hooks.uploadAvatarPair).not.toHaveBeenCalled()
  })

  it('uploads an avatar pair and saves both URLs', async () => {
    renderPage()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'photo.gif', { type: 'image/gif' })] },
    })
    await waitFor(() =>
      expect(updateProfile.mutateAsync).toHaveBeenCalledWith({
        avatar_url: 'u1/id_full.webp',
        avatar_thumb_url: 'u1/id_thumb.webp',
      }),
    )
    expect(hooks.prepareAvatarVariants).toHaveBeenCalled()
    expect(hooks.uploadAvatarPair).toHaveBeenCalled()
  })

  it('cleans up the new pair when saving fails', async () => {
    updateProfile.mutateAsync.mockRejectedValueOnce(new Error('save failed'))
    renderPage()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'photo.gif', { type: 'image/gif' })] },
    })
    await waitFor(() =>
      expect(hooks.deleteAvatarObjects).toHaveBeenCalledWith('u1/id_full.webp', 'u1/id_thumb.webp'),
    )
  })

  it('removes the avatar photo', async () => {
    hooks.useProfile.mockReturnValue({
      data: { ...profile, avatar_url: 'u1/a_full.webp', avatar_thumb_url: 'u1/a_thumb.webp' },
      isLoading: false,
    })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove photo?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove photo' }))
    await waitFor(() =>
      expect(updateProfile.mutateAsync).toHaveBeenCalledWith({ avatar_url: null, avatar_thumb_url: null }),
    )
    await waitFor(() =>
      expect(hooks.deleteAvatarObjects).toHaveBeenCalledWith('u1/a_full.webp', 'u1/a_thumb.webp'),
    )
  })
})

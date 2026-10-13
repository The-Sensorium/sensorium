import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AvatarViewer } from './AvatarViewer'

vi.mock('../features/avatars', () => ({
  useAvatarFullUrl: vi.fn(),
  avatarFullFor: (s: string | null | undefined) => s ?? null,
}))

vi.mock('./Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <img alt={name} />,
}))

import { useAvatarFullUrl } from '../features/avatars'

describe('AvatarViewer', () => {
  it('renders a plain avatar without a viewer button when there is no photo', () => {
    vi.mocked(useAvatarFullUrl).mockReturnValue({ data: undefined } as never)
    render(<AvatarViewer name="Alice" src={null} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Alice' })).toBeInTheDocument()
  })

  it('opens the photo in a lightbox and closes it again', () => {
    vi.mocked(useAvatarFullUrl).mockReturnValue({
      data: 'https://cdn.test/avatar.webp',
    } as never)
    render(<AvatarViewer name="Bob" src="bob.webp" />)
    fireEvent.click(screen.getByRole('button', { name: "View Bob's profile photo" }))
    expect(screen.getByRole('dialog', { name: 'Profile photo preview' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resolves the full variant for the dialog', () => {
    vi.mocked(useAvatarFullUrl).mockReturnValue({
      data: 'https://cdn.test/full.webp',
    } as never)
    render(<AvatarViewer name="Bob" src="u1/a_full.webp" />)
    expect(vi.mocked(useAvatarFullUrl)).toHaveBeenCalledWith('u1/a_full.webp', 'u1/a_full.webp')
  })

  it('portals the lightbox to document.body so ancestors cannot cap it', () => {
    vi.mocked(useAvatarFullUrl).mockReturnValue({
      data: 'https://cdn.test/avatar.webp',
    } as never)
    const { container } = render(
      <div style={{ position: 'relative', zIndex: 20 }}>
        <AvatarViewer name="Bob" src="bob.webp" />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: "View Bob's profile photo" }))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('moves focus into the lightbox and restores it on Escape', () => {
    vi.mocked(useAvatarFullUrl).mockReturnValue({
      data: 'https://cdn.test/avatar.webp',
    } as never)
    render(<AvatarViewer name="Bob" src="bob.webp" />)
    const trigger = screen.getByRole('button', { name: "View Bob's profile photo" })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: 'Close preview' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

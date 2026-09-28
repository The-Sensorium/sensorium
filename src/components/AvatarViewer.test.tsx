import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AvatarViewer } from './AvatarViewer'

vi.mock('../features/avatars', () => ({
  useAvatarUrl: vi.fn(),
}))

vi.mock('./Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <img alt={name} />,
}))

import { useAvatarUrl } from '../features/avatars'

describe('AvatarViewer', () => {
  it('renders a plain avatar without a viewer button when there is no photo', () => {
    vi.mocked(useAvatarUrl).mockReturnValue({ data: undefined } as never)
    render(<AvatarViewer name="Alice" src={null} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Alice' })).toBeInTheDocument()
  })

  it('opens the photo in a lightbox and closes it again', () => {
    vi.mocked(useAvatarUrl).mockReturnValue({
      data: 'https://cdn.test/avatar.webp',
    } as never)
    render(<AvatarViewer name="Bob" src="bob.webp" />)
    fireEvent.click(screen.getByRole('button', { name: "View Bob's profile photo" }))
    expect(screen.getByRole('dialog', { name: 'Profile photo preview' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('portals the lightbox to document.body so ancestors cannot cap it', () => {
    vi.mocked(useAvatarUrl).mockReturnValue({
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
    vi.mocked(useAvatarUrl).mockReturnValue({
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

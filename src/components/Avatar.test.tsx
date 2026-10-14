import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'

vi.mock('../features/avatars', () => ({
  useAvatarThumbUrl: vi.fn(),
  useAvatarFullUrl: vi.fn(() => ({ data: undefined })),
  avatarThumbFor: (s: string | null | undefined) => s ?? null,
  avatarFullFor: (s: string | null | undefined) => s ?? null,
}))

import { useAvatarFullUrl, useAvatarThumbUrl } from '../features/avatars'

describe('Avatar', () => {
  it('renders the initial when there is no resolved url', () => {
    vi.mocked(useAvatarThumbUrl).mockReturnValue({ data: undefined } as never)
    render(<Avatar name="Alice" className="h-8 w-8" />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders an image with an alt label when a url resolves', () => {
    vi.mocked(useAvatarThumbUrl).mockReturnValue({
      data: 'https://cdn.test/avatar.webp',
    } as never)
    render(<Avatar name="Bob" />)
    const img = screen.getByRole('img', { name: 'Bob' })
    expect(img).toHaveAttribute('src', 'https://cdn.test/avatar.webp')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('prefers the thumb url', () => {
    vi.mocked(useAvatarThumbUrl).mockReturnValue({
      data: 'https://cdn.test/thumb.webp',
    } as never)
    render(<Avatar name="Bob" src="u1/a_full.webp" thumbSrc="u1/a_thumb.webp" />)
    expect(vi.mocked(useAvatarThumbUrl)).toHaveBeenCalledWith('u1/a_thumb.webp', 'u1/a_full.webp')
    expect(screen.getByRole('img', { name: 'Bob' })).toHaveAttribute(
      'src',
      'https://cdn.test/thumb.webp',
    )
  })

  it('falls back to the full file when the thumb image fails to load', () => {
    vi.mocked(useAvatarThumbUrl).mockReturnValue({
      data: 'https://cdn.test/thumb.webp',
    } as never)
    vi.mocked(useAvatarFullUrl).mockReturnValue({
      data: 'https://cdn.test/full.webp',
    } as never)
    render(<Avatar name="Bob" src="u1/a_full.webp" />)
    const img = screen.getByRole('img', { name: 'Bob' })
    expect(img).toHaveAttribute('src', 'https://cdn.test/thumb.webp')
    fireEvent.error(img)
    expect(screen.getByRole('img', { name: 'Bob' })).toHaveAttribute(
      'src',
      'https://cdn.test/full.webp',
    )
  })

  it('falls back to the full file when the thumb query fails (missing derived path)', () => {
    vi.mocked(useAvatarThumbUrl).mockReturnValue({
      data: undefined,
      isError: true,
    } as never)
    vi.mocked(useAvatarFullUrl).mockReturnValue({
      data: 'https://cdn.test/full.webp',
    } as never)
    render(<Avatar name="Bob" src="u1/a_full.png" />)
    expect(vi.mocked(useAvatarFullUrl)).toHaveBeenCalledWith(
      'u1/a_full.png',
      'u1/a_full.png',
      { enabled: true },
    )
    expect(screen.getByRole('img', { name: 'Bob' })).toHaveAttribute(
      'src',
      'https://cdn.test/full.webp',
    )
  })

  it('loads the stored path directly when no explicit thumb is given', () => {
    vi.mocked(useAvatarThumbUrl).mockReturnValue({
      data: 'https://cdn.test/full.webp',
    } as never)
    render(<Avatar name="Bob" src="u1/a_full.jpg" />)
    expect(vi.mocked(useAvatarThumbUrl)).toHaveBeenCalledWith('u1/a_full.jpg', 'u1/a_full.jpg')
  })
  it('uppercases the initial', () => {
    vi.mocked(useAvatarThumbUrl).mockReturnValue({ data: undefined } as never)
    render(<Avatar name="carol" className="h-8 w-8" />)
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('scales the initial to the container by default', () => {
    vi.mocked(useAvatarThumbUrl).mockReturnValue({ data: undefined } as never)
    render(<Avatar name="Alice" className="h-32 w-32" />)
    expect(screen.getByText('A')).toHaveClass('text-[42cqi]')
  })

  it('lets textClassName override the scaled default', () => {
    vi.mocked(useAvatarThumbUrl).mockReturnValue({ data: undefined } as never)
    render(<Avatar name="Alice" className="h-8 w-8" textClassName="text-xs" />)
    const initial = screen.getByText('A')
    expect(initial).toHaveClass('text-xs')
    expect(initial).not.toHaveClass('text-[42cqi]')
  })
})

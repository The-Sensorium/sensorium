import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'

vi.mock('../features/avatars', () => ({
  useAvatarUrl: vi.fn(),
}))

import { useAvatarUrl } from '../features/avatars'

describe('Avatar', () => {
  it('renders the initial when there is no resolved url', () => {
    vi.mocked(useAvatarUrl).mockReturnValue({ data: undefined } as never)
    render(<Avatar name="Alice" className="h-8 w-8" />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders an image with an alt label when a url resolves', () => {
    vi.mocked(useAvatarUrl).mockReturnValue({
      data: 'https://cdn.test/avatar.webp',
    } as never)
    render(<Avatar name="Bob" />)
    const img = screen.getByRole('img', { name: 'Bob' })
    expect(img).toHaveAttribute('src', 'https://cdn.test/avatar.webp')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('uppercases the initial', () => {
    vi.mocked(useAvatarUrl).mockReturnValue({ data: undefined } as never)
    render(<Avatar name="carol" className="h-8 w-8" />)
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('scales the initial to the container by default', () => {
    vi.mocked(useAvatarUrl).mockReturnValue({ data: undefined } as never)
    render(<Avatar name="Alice" className="h-32 w-32" />)
    expect(screen.getByText('A')).toHaveClass('text-[42cqi]')
  })

  it('lets textClassName override the scaled default', () => {
    vi.mocked(useAvatarUrl).mockReturnValue({ data: undefined } as never)
    render(<Avatar name="Alice" className="h-8 w-8" textClassName="text-xs" />)
    const initial = screen.getByText('A')
    expect(initial).toHaveClass('text-xs')
    expect(initial).not.toHaveClass('text-[42cqi]')
  })
})

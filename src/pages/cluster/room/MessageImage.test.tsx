import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageImage } from './MessageImage'
import { useChatImageUrl } from '../../../features/cluster'

vi.mock('../../../features/cluster', () => ({ useChatImageUrl: vi.fn() }))

const useChatImageUrlMock = vi.mocked(useChatImageUrl)

describe('MessageImage', () => {
  it('renders the signed image when a URL is available', () => {
    useChatImageUrlMock.mockReturnValue({ data: 'signed://img', isError: false } as never)
    render(<MessageImage path="c1/a.png" alt="a photo" />)
    const img = screen.getByRole('img', { name: 'a photo' })
    expect(img).toHaveAttribute('src', 'signed://img')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img.className).toContain('object-contain')
    expect(img.className).not.toContain('object-cover')
    expect(img.className).not.toContain('aspect-')
  })

  it('shows the unavailable fallback while there is no URL yet', () => {
    useChatImageUrlMock.mockReturnValue({ data: undefined, isError: false } as never)
    render(<MessageImage path="c1/a.png" alt="a photo" />)
    expect(screen.getByText('Image unavailable')).toBeInTheDocument()
  })

  it('shows the unavailable fallback when the signed URL failed', () => {
    useChatImageUrlMock.mockReturnValue({ data: undefined, isError: true } as never)
    render(<MessageImage path="c1/a.png" alt="a photo" />)
    expect(screen.getByText('Image unavailable')).toBeInTheDocument()
  })
})

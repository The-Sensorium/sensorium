import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostMedia } from './PostMedia'

vi.mock('../features/posts', () => ({ usePostImageUrl: vi.fn() }))

import { usePostImageUrl } from '../features/posts'

describe('PostMedia', () => {
  it('renders nothing without media by default', () => {
    vi.mocked(usePostImageUrl).mockReturnValue({ data: undefined } as never)
    const { container } = render(<PostMedia imageUrl={null} gifUrl={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a placeholder without media in compact mode', () => {
    vi.mocked(usePostImageUrl).mockReturnValue({ data: undefined } as never)
    render(<PostMedia imageUrl={null} gifUrl={null} compact />)
    expect(screen.getByText('No image')).toBeInTheDocument()
  })

  it('renders the image instead of the placeholder when media exists', () => {
    vi.mocked(usePostImageUrl).mockReturnValue({ data: undefined } as never)
    render(<PostMedia gifUrl="https://cdn/g.gif" alt="Shared media" compact />)
    expect(screen.getByAltText('Shared media')).toBeInTheDocument()
    expect(screen.queryByText('No image')).not.toBeInTheDocument()
  })
})

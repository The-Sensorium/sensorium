import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostComposer } from './PostComposer'

vi.mock('../features/posts', () => ({
  useCreatePost: vi.fn(),
  uploadPostImage: vi.fn(),
  POST_CONTENT_MAX: 2000,
  POST_TITLE_MAX: 200,
}))
vi.mock('../pages/cluster/room/GifPicker', () => ({ GifPicker: () => null }))

import { useCreatePost } from '../features/posts'

const createMutate = vi.fn().mockResolvedValue('new-id')

function setup() {
  vi.mocked(useCreatePost).mockReturnValue({
    mutateAsync: createMutate,
    isPending: false,
  } as never)
  render(<PostComposer clusterId="c1" />)
}

describe('PostComposer', () => {
  it('disables Post until there is content', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled()
  })

  it('posts text content through the create mutation', async () => {
    setup()
    fireEvent.change(screen.getByRole('textbox', { name: 'New post' }), {
      target: { value: 'Check this out' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith({
        content: 'Check this out',
        imageUrl: undefined,
        gifUrl: undefined,
        title: null,
      }),
    )
  })

  it('posts an optional title', async () => {
    setup()
    fireEvent.change(screen.getByRole('textbox', { name: 'Post title' }), {
      target: { value: 'My heading' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'New post' }), {
      target: { value: 'Body text' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ title: 'My heading' })),
    )
  })
})

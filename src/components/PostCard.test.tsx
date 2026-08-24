import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PostCard } from './PostCard'
import type { Post } from '../features/posts'

vi.mock('../features/posts', () => ({
  useEditPost: vi.fn(),
  useDeletePost: vi.fn(),
  usePostImageUrl: vi.fn(),
}))
vi.mock('../features/avatars', () => ({ useAvatarUrl: vi.fn() }))
vi.mock('../app/auth-context', () => ({ useAuth: vi.fn() }))
vi.mock('./ReportModal', () => ({
  ReportModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="report-modal">Report</div> : null,
}))
vi.mock('./PostMedia', () => ({ PostMedia: () => <img data-testid="post-media" alt="media" /> }))

import { useAuth } from '../app/auth-context'
import { useAvatarUrl } from '../features/avatars'
import { useDeletePost, useEditPost } from '../features/posts'

const editMutate = vi.fn().mockResolvedValue(undefined)
const deleteMutate = vi.fn().mockResolvedValue(undefined)

function fixture(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    cluster_id: 'c1',
    author_id: 'u1',
    content: 'Hello world',
    image_url: null,
    gif_url: null,
    edited_at: null,
    deleted_at: null,
    moderation_status: 'approved',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function setup(overrides: Partial<Post> = {}) {
  const post = fixture(overrides)
  vi.mocked(useAuth).mockReturnValue({ state: 'signedIn', userId: 'u1' } as never)
  vi.mocked(useAvatarUrl).mockReturnValue({ data: undefined } as never)
  vi.mocked(useEditPost).mockReturnValue({
    mutateAsync: editMutate,
    isPending: false,
  } as never)
  vi.mocked(useDeletePost).mockReturnValue({
    mutateAsync: deleteMutate,
    isPending: false,
  } as never)
  const onLike = vi.fn()
  render(
    <MemoryRouter>
      <PostCard
        post={post}
        clusterId="c1"
        author={{ id: post.author_id, display_name: 'Rio', avatar_url: null }}
        likeCount={3}
        likedByMe
        commentCount={2}
        onLike={onLike}
      />
    </MemoryRouter>,
  )
  return { onLike, post }
}

describe('PostCard', () => {
  beforeEach(() => {
    editMutate.mockClear()
    deleteMutate.mockClear()
  })

  it('renders the author, content and comment count', () => {
    setup()
    expect(screen.getByText('Rio')).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows the (you) marker for the author’s own post', () => {
    setup()
    expect(screen.getByText('(you)')).toBeInTheDocument()
  })

  it('shows the heart count and pressed state', () => {
    setup()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument()
  })

  it('invokes onLike when the heart is clicked', () => {
    const { onLike } = setup()
    fireEvent.click(screen.getByRole('button', { pressed: true }))
    expect(onLike).toHaveBeenCalledWith('p1')
  })

  it('offers Edit and Delete to the author and saves an edit', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Post actions' }))
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const input = await screen.findByRole('textbox', { name: 'Edit post' })
    fireEvent.change(input, { target: { value: 'Updated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(editMutate).toHaveBeenCalledWith({ postId: 'p1', content: 'Updated', title: null }),
    )
  })

  it('asks for confirmation before deleting the post', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Post actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete post?' })
    expect(deleteMutate).not.toHaveBeenCalled()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith('p1'))
  })

  it('cancels the delete confirmation without deleting', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Post actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete post?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete post?' })).not.toBeInTheDocument())
    expect(deleteMutate).not.toHaveBeenCalled()
  })

  it('offers Report (not Edit/Delete) for another author and opens the report modal', async () => {
    setup({ author_id: 'u9', content: 'other post' })
    fireEvent.click(screen.getByRole('button', { name: 'Post actions' }))
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Report' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report' }))
    expect(screen.getByTestId('report-modal')).toBeInTheDocument()
  })
})

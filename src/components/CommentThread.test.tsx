import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommentThread } from './CommentThread'
import type { PostComment } from '../features/posts'

vi.mock('../app/auth-context', () => ({ useAuth: vi.fn() }))
vi.mock('../features/avatars', () => ({ useAvatarUrl: vi.fn() }))
vi.mock('../features/posts', () => ({
  useClusterCommentLikes: vi.fn(),
  useCreateComment: vi.fn(),
  useToggleCommentLike: vi.fn(),
  useDeleteComment: vi.fn(),
  uploadPostImage: vi.fn(),
  COMMENT_CONTENT_MAX: 500,
}))
vi.mock('../features/moderation', () => ({
  isMutedAuthor: () => false,
  mutedIds: () => new Set<string>(),
  toggleRevealedId: (prev: Set<string>, id: string) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  },
  useMyMutes: vi.fn(),
}))
vi.mock('./ReportModal', () => ({
  ReportModal: () => null,
}))
vi.mock('./PostMedia', () => ({ PostMedia: () => null }))
vi.mock('../pages/cluster/room/GifPicker', () => ({ GifPicker: () => null }))

import { useAuth } from '../app/auth-context'
import { useAvatarUrl } from '../features/avatars'
import { useClusterCommentLikes, useCreateComment, useDeleteComment, useToggleCommentLike } from '../features/posts'
import { useMyMutes } from '../features/moderation'

function commentFixture(overrides: Partial<PostComment> = {}): PostComment {
  return {
    id: 'c1',
    post_id: 'p1',
    author_id: 'u2',
    content: 'top comment',
    image_url: null,
    gif_url: null,
    parent_comment_id: null,
    deleted_at: null,
    moderation_status: 'approved',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function setup(comments: PostComment[]) {
  vi.mocked(useAuth).mockReturnValue({ state: 'signedIn', userId: 'u1' } as never)
  vi.mocked(useAvatarUrl).mockReturnValue({ data: undefined } as never)
  vi.mocked(useCreateComment).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
  vi.mocked(useToggleCommentLike).mockReturnValue({ mutateAsync: vi.fn() } as never)
  vi.mocked(useDeleteComment).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
  vi.mocked(useClusterCommentLikes).mockReturnValue({ data: [] } as never)
  vi.mocked(useMyMutes).mockReturnValue({ data: [], isLoading: false } as never)
  const members = new Map([
    ['u1', { id: 'u1', display_name: 'Titan', avatar_url: null }],
    ['u2', { id: 'u2', display_name: 'Page', avatar_url: null }],
  ])
  render(
    <CommentThread
      clusterId="cl1"
      postId="p1"
      comments={comments}
      memberById={members as never}
      selfAvatar={{ display_name: 'Titan', avatar_url: null }}
    />,
  )
}

describe('CommentThread reply placement', () => {
  it('renders the composer at the top when not replying', () => {
    setup([commentFixture()])
    const heading = screen.getByText(/Comments \(1\)/)
    const composer = screen.getByRole('textbox', { name: 'Add a comment' })
    expect(heading.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/Replying to/)).not.toBeInTheDocument()
  })

  it('moves the composer inline below the reply target when Reply is clicked', () => {
    const top = commentFixture({ id: 'c1', content: 'top comment' })
    const reply = commentFixture({ id: 'c2', content: 'nested reply', parent_comment_id: 'c1' })
    setup([top, reply])

    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0])
    expect(screen.getByText(/Replying to/)).toBeInTheDocument()

    const composer = screen.getByRole('textbox', { name: 'Add a comment' })
    const topContent = screen.getByText('top comment')
    const nestedContent = screen.getByText('nested reply')
    expect(topContent.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(composer.compareDocumentPosition(nestedContent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('places the composer directly below a nested reply when replying to it', () => {
    const top = commentFixture({ id: 'c1', content: 'top comment' })
    const r1 = commentFixture({ id: 'c2', content: 'first reply', parent_comment_id: 'c1' })
    const r2 = commentFixture({ id: 'c3', content: 'second reply', parent_comment_id: 'c1' })
    setup([top, r1, r2])

    const replyButtons = screen.getAllByRole('button', { name: 'Reply' })
    fireEvent.click(replyButtons[1])

    const composer = screen.getByRole('textbox', { name: 'Add a comment' })
    const first = screen.getByText('first reply')
    const second = screen.getByText('second reply')
    expect(first.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(composer.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
